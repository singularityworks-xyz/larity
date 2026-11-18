/** Synthetic provider check; sends no transcripts or organization records. */

import { LiveMeetingAnalyzer } from "../packages/meeting-mode/src/pipeline/live-analyzer";
import { LiveDecisionAnalyzer } from "../packages/meeting-mode/src/pipeline/live-decision";
import type {
  Tier2Input,
  Tier4Context,
} from "../packages/meeting-mode/src/pipeline/types";
import type { Utterance } from "../packages/meeting-mode/src/utterance/types";

const speaker: Utterance["speaker"] = {
  speakerId: "synthetic-team",
  userId: "synthetic-user",
  name: "Synthetic speaker",
  type: "TEAM",
  confidence: 1,
  diarizationIndices: [0],
  isCurrentUser: true,
};
const earlier: Utterance = {
  utteranceId: "synthetic:0",
  sessionId: "synthetic",
  text: "I promise delivery on May 15.",
  speaker,
  timestamp: 1000,
  duration: 1,
  startOffset: 0,
  wordCount: 7,
  mergedCount: 1,
  confidenceScore: 1,
};
const scenarios = [
  {
    name: "revised-deadline",
    text: "Actually, I cannot deliver on May 15. We need until June 30.",
    expected: "self_contradiction",
    history: [earlier],
  },
  {
    name: "org-policy",
    text: "I will send the customer personal records to my private email account today.",
    expected: "policy_violation",
    history: [],
  },
  {
    name: "safe-estimate",
    text: "Engineering will review the requirements before we offer a delivery estimate.",
    expected: "none",
    history: [],
  },
];
const requestedTimeout = process.argv
  .find((arg) => arg.startsWith("--timeout-ms="))
  ?.split("=")[1];
const decisionMode = process.argv.includes("--decision");
const options = requestedTimeout ? { timeoutMs: Number(requestedTimeout) } : {};
const analyzer = decisionMode
  ? new LiveDecisionAnalyzer(options)
  : new LiveMeetingAnalyzer(options);
const results: Array<{
  scenario: string;
  ms: number;
  expected: string;
  actual: string;
  surfaced?: boolean;
  confidence?: number;
  classificationValid?: boolean;
  promptTokens: number;
  completionTokens: number;
}> = [];
for (const [index, scenario] of scenarios.entries()) {
  const context: Tier4Context = {
    sessionId: "synthetic",
    triggerUtteranceId: `synthetic:${index + 1}`,
    utterance: scenario.text,
    speaker,
    topicId: undefined,
    topicSummary: "Synthetic delivery review",
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
    recentUtterances: scenario.history,
    matchedCommitments: [],
    memoryStatus: "ok",
    matchedHistoricalItems:
      scenario.name === "org-policy"
        ? [
            {
              memoryType: "policy_guardrail",
              sourceId: "synthetic-policy",
              similarity: 0.95,
              item: "Customer personal records must stay within approved company systems. Private email accounts are prohibited.",
            },
          ]
        : [],
    relevantConstraints: [],
  };
  const input: Tier2Input = {
    utterance: scenario.text,
    speaker,
    recentSameSpeaker: scenario.history.map((u) => u.text),
  };
  const start = performance.now();
  const result = await analyzer.analyze(
    context,
    input,
    new AbortController().signal
  );
  results.push({
    scenario: scenario.name,
    ms: Math.round(performance.now() - start),
    expected: scenario.expected,
    actual: result.response?.alertType ?? "unavailable",
    surfaced: result.response?.shouldSurface,
    confidence: result.response?.confidence,
    classificationValid: decisionMode
      ? undefined
      : result.classification !== null,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });
}
console.log(JSON.stringify(results, null, 2));
if (
  results.some(
    (result) =>
      result.actual !== result.expected ||
      !(decisionMode || result.classificationValid)
  )
) {
  process.exitCode = 1;
}
