import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { SttResult } from "../../../stt/src/types";
import { getMetricsSnapshot, resetMetrics } from "../pipeline/metrics";
import { UtteranceFinalizer } from "./finalizer";

const embedMock = mock(() => Promise.resolve([0.1, 0.2]));
const assignTopicMock = mock(() => Promise.resolve("topic-1"));
const finalizerDependencies = {
  embedder: { embed: embedMock },
  topicManager: {
    applyTier2TopicDelta: () => Promise.resolve(),
    assignTopic: assignTopicMock,
    closeSession: () => Promise.resolve(),
    getTopics: () => [],
  },
};

function makeFinal(
  overrides: Partial<SttResult> & { text: string }
): SttResult {
  return {
    channel: 0,
    confidence: 0.9,
    diarizationIndex: 0,
    duration: 1,
    isFinal: true,
    sessionId: "test-session",
    speechTimestamp: Date.now() - 500,
    start: 0,
    transcript: overrides.text,
    ts: Date.now() - 400,
    type: "stt_final",
    ...overrides,
  };
}

describe("UtteranceFinalizer publish-path metrics", () => {
  beforeEach(() => {
    resetMetrics();
    embedMock.mockClear();
    assignTopicMock.mockClear();
  });

  test("records embed wait, merger hold, and stt-to-publish on first publish", async () => {
    const published: string[] = [];
    const topicDeltas: unknown[] = [];
    const finalizer = new UtteranceFinalizer(
      {
        hset: () => Promise.resolve(0),
        publish: (channel, message) => {
          if (channel.startsWith("meeting.utterance.")) {
            published.push(`${channel}:${message.slice(0, 10)}`);
          } else {
            topicDeltas.push(JSON.parse(message) as unknown);
          }
          return Promise.resolve(1);
        },
      },
      { dependencies: finalizerDependencies }
    );

    // Two different-speaker finals: the second forces the first out of the merger.
    await finalizer.process(
      makeFinal({ diarizationIndex: 0, text: "hello world today" })
    );
    await finalizer.process(
      makeFinal({ diarizationIndex: 1, text: "another line here now" })
    );

    expect(published.length).toBe(1);
    // P2.1: the first utterance is published before its topic is assigned,
    // then patched via a topic delta.
    expect(topicDeltas).toEqual([
      {
        type: "utterance_topic",
        utteranceId: "test-session:0",
        topicId: "topic-1",
      },
      {
        type: "utterance_topic",
        utteranceId: "test-session:1",
        topicId: "topic-1",
      },
    ]);
    const snap = getMetricsSnapshot();
    expect(snap.histograms["finalizer.embed_wait_ms"]?.count).toBe(2);
    expect(snap.histograms["finalizer.stt_final_to_publish_ms"]?.count).toBe(1);
    expect(snap.histograms["finalizer.merger_hold_ms"]?.count).toBe(1);
    expect(
      snap.histograms["finalizer.stt_final_to_publish_ms"]?.min
    ).toBeGreaterThanOrEqual(0);
  });

  test("merged utterance does not leak timing anchors", async () => {
    const finalizer = new UtteranceFinalizer(
      {
        hset: () => Promise.resolve(0),
        publish: () => Promise.resolve(1),
      },
      { dependencies: finalizerDependencies }
    );

    // Same speaker, back-to-back: second merges into the first, no publish yet.
    await finalizer.process(
      makeFinal({ diarizationIndex: 0, text: "first part spoken" })
    );
    await finalizer.process(
      makeFinal({ diarizationIndex: 0, text: "second part spoken" })
    );

    const snap = getMetricsSnapshot();
    expect(snap.histograms["finalizer.embed_wait_ms"]?.count).toBe(2);
    expect(
      snap.histograms["finalizer.stt_final_to_publish_ms"]
    ).toBeUndefined();

    await finalizer.closeSession("test-session");
    const after = getMetricsSnapshot();
    // closeSession flushes the merged pending utterance exactly once.
    expect(after.histograms["finalizer.stt_final_to_publish_ms"]?.count).toBe(
      1
    );
  });
});
