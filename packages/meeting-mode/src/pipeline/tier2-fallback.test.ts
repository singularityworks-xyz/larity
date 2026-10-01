import { describe, expect, test } from "bun:test";
import { Tier2Classifier } from "./tier2";
import type { Tier2Input } from "./types";

function makeInput(): Tier2Input {
  return {
    recentSameSpeaker: [],
    speaker: {
      confidence: 0.9,
      diarizationIndices: [0],
      isCurrentUser: false,
      name: "Tester",
      speakerId: "spk_0",
      type: "TEAM",
      userId: "u1",
    },
    utterance: "we will deliver the release by Friday",
  };
}

const VALID_CLASSIFICATION = JSON.stringify({
  commitmentType: null,
  confidence: 0.9,
  extractedData: {},
  intent: "concern",
  riskSignals: ["test risk"],
  tone: "neutral",
});

describe("Tier2Classifier fallback", () => {
  test("provider failure stops deep reasoning and marks fallback", async () => {
    const tier2 = new Tier2Classifier({
      invoke: () => Promise.reject(new Error("timeout of 3000ms exceeded")),
      timeoutMs: 50,
    });

    const outcome = await tier2.classify(makeInput());

    expect(outcome.isFallback).toBe(true);
    expect(outcome.shouldStopForDeepReasoning).toBe(true);
    expect(outcome.classification.intent).toBe("general");
    expect(outcome.classification.confidence).toBe(0);
  });

  test("invalid schema stops deep reasoning and marks fallback", async () => {
    const tier2 = new Tier2Classifier({
      invoke: () =>
        Promise.resolve({
          completionTokens: 1,
          promptTokens: 1,
          text: "not json at all",
        }),
      timeoutMs: 1000,
    });

    const outcome = await tier2.classify(makeInput());

    expect(outcome.isFallback).toBe(true);
    expect(outcome.shouldStopForDeepReasoning).toBe(true);
  });

  test("successful classification is not a fallback", async () => {
    const tier2 = new Tier2Classifier({
      invoke: () =>
        Promise.resolve({
          completionTokens: 5,
          promptTokens: 50,
          text: VALID_CLASSIFICATION,
        }),
      timeoutMs: 1000,
    });

    const outcome = await tier2.classify(makeInput());

    expect(outcome.isFallback).toBe(false);
    expect(outcome.classification.intent).toBe("concern");
  });
});
