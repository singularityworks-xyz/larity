import { describe, expect, test } from "bun:test";
import type { SttResult } from "../../../stt/src/types";
import { getMetricsSnapshot, resetMetrics } from "../pipeline/metrics";
import { UtteranceFinalizer } from "./finalizer";

const resolvers: Array<(embedding: number[]) => void> = [];
const finalizerDependencies = {
  embedder: {
    embed() {
      return new Promise<number[]>((resolve) => {
        resolvers.push(resolve);
      });
    },
  },
  topicManager: {
    applyTier2TopicDelta: () => Promise.resolve(),
    assignTopic: (utterance: { embeddingPromise?: Promise<unknown> }) =>
      (utterance.embeddingPromise ?? Promise.resolve()).then(() => "topic-1"),
    closeSession: () => Promise.resolve(),
    getTopics: () => [],
  },
};

function makeFinal(
  diarizationIndex: number,
  text: string,
  speechTimestamp: number
): SttResult {
  return {
    channel: 0,
    confidence: 0.9,
    diarizationIndex,
    duration: 1,
    isFinal: true,
    sessionId: "test-session",
    speechTimestamp,
    start: 0,
    transcript: text,
    ts: Date.now(),
    type: "stt_final",
  };
}

describe("UtteranceFinalizer per-session ordering", () => {
  test("two rapid finals publish in finalize order despite slow first embed", async () => {
    resetMetrics();
    resolvers.length = 0;
    const publishedIds: string[] = [];
    const finalizer = new UtteranceFinalizer(
      {
        hset: () => Promise.resolve(0),
        publish: (channel, message) => {
          // Topic deltas share the publisher; only utterance publishes count here.
          if (!channel.startsWith("meeting.utterance.")) {
            return Promise.resolve(1);
          }
          const parsed = JSON.parse(message) as { utteranceId?: string };
          if (parsed.utteranceId) {
            publishedIds.push(parsed.utteranceId);
          }
          return Promise.resolve(1);
        },
      },
      { dependencies: finalizerDependencies }
    );

    const now = Date.now();
    const first = finalizer.process(
      makeFinal(0, "first speaker says hello", now - 2000)
    );
    const second = finalizer.process(
      makeFinal(1, "second speaker replies here", now - 1000)
    );
    // Let both reach their embedding await; only the first may proceed.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(resolvers.length).toBe(1);

    // Resolve out of arrival order: only the first embed exists so far.
    resolvers[0]?.([0.1]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // The second finalize now started and awaits its own embed.
    expect(resolvers.length).toBe(2);
    resolvers[1]?.([0.2]);

    await Promise.all([first, second]);
    // Different speakers: the first finalize's utterance is released when
    // the second pushes. Order must be finalize order, not embed order.
    expect(publishedIds).toEqual(["test-session:0"]);

    await finalizer.closeSession("test-session");
    expect(publishedIds).toEqual(["test-session:0", "test-session:1"]);
    expect(
      getMetricsSnapshot().histograms["finalizer.stt_final_to_publish_ms"]
        ?.count
    ).toBe(2);
  });
});
