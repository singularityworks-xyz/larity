import { describe, expect, it } from "bun:test";
import { Tier4DeepReasoner } from "../../src/pipeline/tier4";
import {
  buildAlertFromTier4Response,
  coerceTier4RoutingForPublication,
  MIN_TIER4_SURFACING_CONFIDENCE,
  shouldTier4Respond,
} from "../../src/pipeline/tier4-alert";
import type {
  Tier4Context,
  Tier4HistoricalMatch,
  Tier4Response,
} from "../../src/pipeline/types";

function minimalContext(overrides: Partial<Tier4Context> = {}): Tier4Context {
  const historical: Tier4HistoricalMatch[] = [];

  const base: Tier4Context = {
    triggerUtteranceId: "utt-1",
    utterance: "We ship in two weeks, no blocker.",
    speaker: {
      speakerId: "spk_alice",
      type: "TEAM",
      name: "Alice",
      userId: "user-alice",
      diarizationIndices: [0],
      isCurrentUser: true,
      confidence: 0.92,
    },
    topicId: "topic-plan",
    topicSummary: "Delivery planning",
    tier1Result: {
      detections: [],
      blocklistHit: false,
      technicalHit: false,
    },
    tier2Classification: {
      intent: "commitment",
      commitmentType: "timeline",
      tone: "confident",
      riskSignals: ["unscoped promise"],
      extractedData: {},
      confidence: 0.91,
    },
    recentUtterances: [],
    matchedHistoricalItems: historical,
    matchedCommitments: [],
    relevantConstraints: [],
  };

  return { ...base, ...overrides };
}

describe("pipeline/tier4", () => {
  it("returns parsed Tier 4 payload on valid JSON", async () => {
    const reasoner = new Tier4DeepReasoner({
      invoke: async () =>
        JSON.stringify({
          alertType: "risky_commitment",
          severity: "medium",
          message: "Deadline not scoped; clarify scope.",
          surfaceReason:
            "The speaker promised a firm date with no scope or dependency caveats.",
          suggestion:
            "Say you will confirm after engineering review, and offer a date range or milestone plan instead.",
          confidence: 0.88,
          shouldSurface: true,
          reasoning:
            "Utterance encodes unconditional delivery without scope guardrail.",
          routing: "personal",
          targetUserId: "user-alice",
        }),
    });

    const result = await reasoner.reason(minimalContext());
    expect(result.response).not.toBeNull();
    expect(result.response?.alertType).toBe("risky_commitment");
    expect(result.response?.confidence).toBeGreaterThanOrEqual(
      MIN_TIER4_SURFACING_CONFIDENCE
    );
  });

  it("fails silently on malformed JSON payload", async () => {
    const reasoner = new Tier4DeepReasoner({
      invoke: async () => "not-json",
    });
    const result = await reasoner.reason(minimalContext());
    expect(result.response).toBeNull();
    expect(result.tokenCount).toBe(0);
  });

  it("fails silently when schema rejects model output", async () => {
    const reasoner = new Tier4DeepReasoner({
      invoke: async () =>
        JSON.stringify({
          alertType: "risky_commitment",
          severity: "medium",
          // missing mandatory fields triggers safeParse=false
          confidence: 2,
          shouldSurface: true,
          routing: "personal",
          message: "",
          reasoning: "x",
        }),
    });

    const result2 = await reasoner.reason(minimalContext());
    expect(result2.response).toBeNull();
    expect(result2.tokenCount).toBe(0);
  });

  it("times out invoking Gemini layer", async () => {
    const reasoner = new Tier4DeepReasoner({
      timeoutMs: 5,
      invoke: async (_, timeoutMs) => {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, timeoutMs + 30);
        });
        return "{}";
      },
    });

    const result3 = await reasoner.reason(minimalContext());
    expect(result3.response).toBeNull();
    expect(result3.tokenCount).toBe(0);
  });
});

describe("pipeline/tier4 surfacing guards", () => {
  const response: Tier4Response = {
    alertType: "risky_commitment",
    severity: "medium",
    message: "Test message",
    surfaceReason:
      "Speaker committed to a delivery date without confirming scope or risks.",
    suggestion: "Pause and restate what is in scope before agreeing to a date.",
    confidence: MIN_TIER4_SURFACING_CONFIDENCE + 0.05,
    shouldSurface: true,
    reasoning: "Hidden diagnostic text",
    routing: "personal",
    targetUserId: undefined,
  };

  it("abstains when surfaceReason or suggestion missing despite high confidence", () => {
    expect(
      shouldTier4Respond({
        ...response,
        surfaceReason: "   ",
      })
    ).toBe(false);
    expect(
      shouldTier4Respond({
        ...response,
        suggestion: undefined,
      })
    ).toBe(false);
  });

  it("abstains when confidence low", () => {
    expect(
      shouldTier4Respond({
        ...response,
        confidence: MIN_TIER4_SURFACING_CONFIDENCE - 0.05,
      })
    ).toBe(false);
  });

  it("fills target user from speaker for personal alerts", () => {
    const coerced = coerceTier4RoutingForPublication({
      response,
      triggerSpeaker: {
        speakerId: "spk",
        type: "TEAM",
        name: "A",
        userId: "u1",
        diarizationIndices: [0],
        isCurrentUser: true,
        confidence: 0.9,
      },
    });

    expect(coerced.routing).toBe("personal");
    expect(coerced.targetUserId).toBe("u1");
  });

  it("builds alert from Tier 4 structured output", () => {
    const speaker: Tier4Context["speaker"] = {
      speakerId: "spk",
      type: "TEAM",
      name: "A",
      userId: "u1",
      diarizationIndices: [0],
      isCurrentUser: true,
      confidence: 0.9,
    };

    const alert = buildAlertFromTier4Response({
      response,
      speaker,
      triggerUtteranceId: "utt-xyz",
      topicId: "topic-test",
    });

    expect(alert).not.toBeNull();
    expect(alert?.triggerTier).toBe(4);
    expect(alert?.category).toBe("risky_commitment");
    expect(alert?.surfaceReason).toContain("scope");
    expect(alert?.suggestion).toContain("Pause");
  });
});
