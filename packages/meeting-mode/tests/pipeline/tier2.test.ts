import { describe, expect, it } from "bun:test";
import { Tier2Classifier } from "../../src/pipeline/tier2";
import { createTeamSpeaker } from "../helpers";

describe("pipeline/tier2", () => {
  it("parses valid classifier response and computes gate decision", async () => {
    const classifier = new Tier2Classifier({
      invoke: async () =>
        JSON.stringify({
          intent: "commitment",
          commitmentType: "timeline",
          tone: "confident",
          riskSignals: ["unconditional promise"],
          extractedData: { deadline: "next friday" },
          confidence: 0.92,
          topicDelta: {
            commitment: "Deliver integration by next friday",
            owner: "Alice",
            deadline: "next friday",
          },
        }),
    });

    const result = await classifier.classify({
      utterance: "We will deliver this by next friday",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      recentSameSpeaker: ["We already estimated the work yesterday"],
      topicLabel: "Delivery timeline",
    });

    expect(result.classification.intent).toBe("commitment");
    expect(result.classification.commitmentType).toBe("timeline");
    expect(result.shouldStopForDeepReasoning).toBe(false);
  });

  it("fails silent on invalid schema", async () => {
    const classifier = new Tier2Classifier({
      invoke: async () =>
        JSON.stringify({
          intent: "unknown-intent",
        }),
    });

    const result = await classifier.classify({
      utterance: "Random message",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      recentSameSpeaker: [],
    });

    expect(result.classification.intent).toBe("general");
    expect(result.classification.confidence).toBe(0);
    expect(result.shouldStopForDeepReasoning).toBe(false);
  });

  it("stops deep reasoning for high-confidence filler", async () => {
    const classifier = new Tier2Classifier({
      invoke: async () =>
        JSON.stringify({
          intent: "filler",
          commitmentType: null,
          tone: "neutral",
          riskSignals: [],
          extractedData: {},
          confidence: 0.9,
        }),
    });

    const result = await classifier.classify({
      utterance: "Yeah okay makes sense",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      recentSameSpeaker: [],
    });

    expect(result.shouldStopForDeepReasoning).toBe(true);
  });
});
