import { describe, expect, mock, test } from "bun:test";
import type { Utterance } from "../utterance/types";

mock.restore();
const { TopicManager } = await import("./manager");

function makeUtterance(): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1,
    embedding: [0.5, 0.1, 0.3],
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

describe("TopicManager persist+publish (P2.10)", () => {
  test("topic delta persists state and broadcasts", async () => {
    const hset = mock(() => Promise.resolve(1));
    const publishedPayloads: string[] = [];
    const publish = mock((_channel: string, message: string) => {
      publishedPayloads.push(message);
      return Promise.resolve(1);
    });
    const manager = new TopicManager(
      { hset, publish },
      { enableAsyncSummarization: false }
    );

    // Direct embedding: no provider call.
    const topicId = await manager.assignTopic(makeUtterance());
    expect(hset).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);

    await manager.applyTier2TopicDelta("test-session", topicId, {
      labelHint: "Delivery timeline",
    });

    expect(hset).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(2);
    const lastPayload = publishedPayloads[1] ?? "{}";
    const parsed = JSON.parse(lastPayload) as { label?: string };
    expect(parsed.label).toBe("Delivery timeline");
  });
});
