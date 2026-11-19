import { describe, expect, test } from "bun:test";
import type { Tier4Context } from "../types";
import { buildDecisionAlert, LiveDecisionAnalyzer } from "./live-decision";

function context(): Tier4Context {
  const speaker = {
    speakerId: "team",
    userId: "ada",
    name: "Ada",
    type: "TEAM" as const,
    confidence: 1,
    isCurrentUser: true,
    diarizationIndices: [0],
  };
  return {
    utterance: "We cannot deliver until June",
    triggerUtteranceId: "s:1",
    sessionId: "s",
    speaker,
    topicId: undefined,
    topicSummary: "Delivery",
    relevantConstraints: [],
    matchedCommitments: [],
    matchedHistoricalItems: [],
    tier1Result: {
      detections: [],
      blocklistHit: false,
      technicalHit: false,
      pricingHit: false,
    },
    tier2Classification: {
      intent: "general",
      commitmentType: null,
      tone: "neutral",
      riskSignals: [],
      extractedData: {},
      confidence: 0,
    },
    recentUtterances: [
      {
        utteranceId: "s:0",
        sessionId: "s",
        text: "We promise delivery in May",
        speaker,
        confidenceScore: 1,
        duration: 1,
        startOffset: 0,
        timestamp: 1,
        mergedCount: 1,
        wordCount: 6,
      },
    ],
  };
}

describe("bounded alert decisions", () => {
  test("builds an attributed contradiction from an existing evidence ID", () => {
    const alert = buildDecisionAlert(context(), {
      alertType: "self_contradiction",
      confidence: 0.95,
      severity: "high",
      evidenceId: "utterance:s:0",
    });
    expect(alert?.routing).toBe("personal");
    expect(alert?.targetUserId).toBe("ada");
    expect(alert?.surfaceReason).toContain("delivery in May");
    expect(alert?.suggestion).toContain("commitment");
  });

  test("rejects invented references and false speaker attribution", () => {
    const ctx = context();
    const decision = {
      alertType: "self_contradiction" as const,
      confidence: 0.99,
      severity: "high" as const,
      evidenceId: "invented",
    };
    expect(buildDecisionAlert(ctx, decision)).toBeNull();
    const earlier = ctx.recentUtterances[0];
    if (earlier) {
      earlier.speaker = {
        ...earlier.speaker,
        userId: undefined,
        speakerId: "other",
      };
    }
    ctx.speaker = { ...ctx.speaker, userId: undefined };
    expect(
      buildDecisionAlert(ctx, { ...decision, evidenceId: "utterance:s:0" })
    ).toBeNull();
  });

  test("does not label another team's statement as the speaker's own", () => {
    const ctx = context();
    const earlier = ctx.recentUtterances[0];
    if (earlier) {
      earlier.speaker = {
        ...earlier.speaker,
        userId: "bea",
        speakerId: "other-team",
      };
    }
    const alert = buildDecisionAlert(ctx, {
      alertType: "team_inconsistency",
      confidence: 0.9,
      severity: "high",
      evidenceId: "utterance:s:0",
    });
    expect(alert?.routing).toBe("shared");
  });

  test("compact provider returns no extraction and rejects unsafe output", async () => {
    const ctx = context();
    const analyzer = new LiveDecisionAnalyzer({
      invoke: () =>
        Promise.resolve({
          text: JSON.stringify({
            alertType: "self_contradiction",
            severity: "high",
            confidence: 0.95,
            evidenceId: "utterance:s:0",
          }),
          classification: null,
          response: null,
          promptTokens: 10,
          completionTokens: 5,
        }),
    });
    const result = await analyzer.analyze(
      ctx,
      { utterance: ctx.utterance, speaker: ctx.speaker, recentSameSpeaker: [] },
      new AbortController().signal
    );
    expect(analyzer.requiresClassification).toBe(true);
    expect(result.classification).toBeNull();
    expect(result.response?.alertType).toBe("self_contradiction");
  });
});
