import { describe, expect, test } from "bun:test";
import {
  isBackendTopicState,
  isUtteranceTopicDelta,
  mapBackendUtteranceToLive,
} from "./mappers";

function makeBackendUtterance(topicId?: string) {
  return {
    confidenceScore: 0.9,
    duration: 1,
    mergedCount: 1,
    sessionId: "s1",
    speaker: {
      confidence: 0.9,
      diarizationIndices: [0],
      isCurrentUser: false,
      name: "Speaker 1",
      speakerId: "spk_0",
      type: "EXTERNAL" as const,
    },
    startOffset: 0,
    text: "hello world today",
    timestamp: 1234,
    ...(topicId === undefined ? {} : { topicId }),
    utteranceId: "s1:0",
    wordCount: 3,
  };
}

describe("utterance topic deltas (P2.1)", () => {
  test("delta shape is recognized and full topic state is not a delta", () => {
    expect(
      isUtteranceTopicDelta({
        topicId: "topic_1",
        type: "utterance_topic",
        utteranceId: "s1:0",
      })
    ).toBe(true);
    expect(
      isUtteranceTopicDelta({
        label: "Delivery",
        topicId: "topic_1",
      })
    ).toBe(false);
    expect(isUtteranceTopicDelta(null)).toBe(false);
    expect(
      isUtteranceTopicDelta({ topicId: "topic_1", utteranceId: "s1:0" })
    ).toBe(false);
  });

  test("full topic state and delta classify disjointly", () => {
    expect(
      isBackendTopicState({
        label: "Delivery",
        lastUpdated: 1,
        topicId: "topic_1",
      })
    ).toBe(true);
    // Deltas share topicId but carry no label: not full topic state.
    expect(
      isBackendTopicState({
        topicId: "topic_1",
        type: "utterance_topic",
        utteranceId: "s1:0",
      })
    ).toBe(false);
  });

  test("utterance mapping carries topicId through when present", () => {
    expect(
      mapBackendUtteranceToLive(makeBackendUtterance("topic_9")).topicId
    ).toBe("topic_9");
    expect(
      mapBackendUtteranceToLive(makeBackendUtterance()).topicId
    ).toBeUndefined();
  });
});
