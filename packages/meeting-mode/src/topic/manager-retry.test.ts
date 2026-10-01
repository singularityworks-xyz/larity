import { describe, expect, test } from "bun:test";
import type { Utterance } from "../utterance/types";
import { TopicManager } from "./manager";

function makeUtterance(): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1,
    mergedCount: 1,
    sessionId: "test-session",
    speaker: {
      confidence: 0.9,
      diarizationIndices: [0],
      isCurrentUser: false,
      name: "Speaker 1",
      speakerId: "spk_0",
      type: "EXTERNAL",
    },
    startOffset: 0,
    text: "we will deliver the release by Friday",
    timestamp: Date.now(),
    utteranceId: "test-session:0",
    wordCount: 7,
  };
}

describe("TopicManager single-failure policy (P2.2)", () => {
  test("a failed in-flight embedding is not retried", async () => {
    const manager = new TopicManager(
      {
        hset: () => Promise.resolve(0),
        publish: () => Promise.resolve(1),
      },
      { enableAsyncSummarization: false }
    );

    const utterance = makeUtterance();
    utterance.embeddingPromise = Promise.resolve(undefined);

    const topicId = await manager.assignTopic(utterance);

    expect(topicId.startsWith("topic_")).toBe(true);
    expect(utterance.embedding).toEqual([]);
  });
});
