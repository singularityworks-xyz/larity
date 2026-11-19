import { describe, expect, mock, test } from "bun:test";
import type { Tier2Input, Tier4Context } from "../types";
import { buildLiveAnalysisPrompt, LiveMeetingAnalyzer } from "./live-analyzer";

const speaker = {
  speakerId: "spk_0",
  name: "Ada",
  type: "TEAM" as const,
  confidence: 1,
  diarizationIndices: [0],
  isCurrentUser: true,
  userId: "ada",
};
const input: Tier2Input = {
  utterance: "We will ship in June",
  speaker,
  recentSameSpeaker: [],
};
const context: Tier4Context = {
  utterance: input.utterance,
  triggerUtteranceId: "s:1",
  sessionId: "s",
  speaker,
  topicId: undefined,
  topicSummary: "Shipping",
  recentUtterances: [],
  relevantConstraints: [],
  matchedCommitments: [],
  matchedHistoricalItems: [],
  tier1Result: {
    detections: [],
    technicalHit: false,
    blocklistHit: false,
    pricingHit: true,
  },
  tier2Classification: {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    confidence: 0,
    extractedData: {},
  },
};
const classification = {
  ...context.tier2Classification,
  intent: "commitment",
  commitmentType: "timeline",
};
const alert = {
  alertType: "none",
  shouldSurface: false,
  confidence: 0.9,
  severity: "low",
  message: "No actionable risk",
  reasoning: "No conflicting evidence",
  routing: "shared",
  surfaceReason: null,
  suggestion: null,
  targetUserId: null,
};
const response = (promptTokens: number) => ({
  text: JSON.stringify({ classification, alert }),
  promptTokens,
  completionTokens: 5,
});

describe("live analyzer", () => {
  test("one request returns classification and alert with request-local usage", async () => {
    let calls = 0;
    const analyzer = new LiveMeetingAnalyzer({
      invoke: () => Promise.resolve(response(++calls * 10)),
    });
    const results = await Promise.all([
      analyzer.analyze(context, input, new AbortController().signal),
      analyzer.analyze(context, input, new AbortController().signal),
    ]);
    expect(results.map((r) => r.promptTokens)).toEqual([10, 20]);
    expect(results[0]?.classification?.intent).toBe("commitment");
    expect(results[0]?.response?.alertType).toBe("none");
  });

  test("bounds a provider that ignores cancellation", async () => {
    let invocationSignal: AbortSignal | undefined;
    const analyzer = new LiveMeetingAnalyzer({
      timeoutMs: 10,
      invoke: (_prompt, signal) => {
        invocationSignal = signal;
        return new Promise(() => undefined);
      },
    });
    const result = await analyzer.analyze(
      context,
      input,
      new AbortController().signal
    );
    expect(invocationSignal?.aborted).toBe(true);
    expect(result.response).toBeNull();
  });

  test("already closed sessions do not invoke the provider", async () => {
    const invoke = mock(() => Promise.resolve(response(10)));
    const controller = new AbortController();
    controller.abort();
    await new LiveMeetingAnalyzer({ invoke }).analyze(
      context,
      input,
      controller.signal
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  test("malformed output abstains; a schema error keeps returned usage", async () => {
    const analyzer = new LiveMeetingAnalyzer({
      invoke: () =>
        Promise.resolve({
          text: JSON.stringify({
            classification: { intent: "invalid" },
            alert,
          }),
          promptTokens: 20,
          completionTokens: 5,
        }),
    });
    const result = await analyzer.analyze(
      context,
      input,
      new AbortController().signal
    );
    expect(result.classification).toBeNull();
    expect(result.response?.alertType).toBe("none");
    expect(result.promptTokens).toBe(20);
    const malformed = new LiveMeetingAnalyzer({
      invoke: () => Promise.resolve({ ...response(30), text: "{" }),
    });
    const failed = await malformed.analyze(
      context,
      input,
      new AbortController().signal
    );
    expect(failed.response).toBeNull();
    expect(failed.promptTokens).toBe(30);
  });

  test("joint prompt preserves all categories, pricing cue, identity and extraction fields", () => {
    const prompt = buildLiveAnalysisPrompt(context, input);
    for (const category of [
      "self_contradiction",
      "team_inconsistency",
      "client_backtrack",
      "risky_commitment",
      "policy_violation",
      "information_risk",
      "tone_warning",
      "pressure_detected",
      "scope_creep",
      "missing_clarity",
      "client_disengagement",
      "undiscussed_agenda",
    ]) {
      expect(prompt).toContain(category);
    }
    for (const field of [
      "extractedData",
      "topicDelta",
      "identityGuess",
      "commitmentType",
    ]) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain('"pricingHit":true');
    // No artificial zero-confidence classification is passed as model evidence.
    expect(prompt).not.toContain('"tier2":{"intent":"general"');
  });
});
