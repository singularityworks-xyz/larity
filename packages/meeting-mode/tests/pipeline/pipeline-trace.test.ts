import { describe, expect, it } from "bun:test";
import type { PipelineEvaluationResult } from "../../src/pipeline/engine";
import { buildPipelineTracePayload } from "../../src/pipeline/pipeline-trace";
import type { Utterance } from "../../src/utterance/types";

const baseUtterance = (): Utterance => ({
  utteranceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  sessionId: "sess-1",
  text: "We will ship the beta by Monday next week.",
  timestamp: Date.now(),
  speaker: {
    speakerId: "sp-1",
    type: "TEAM",
    userId: "user-alex",
    name: "Alex",
    diarizationIndices: [0],
    isCurrentUser: true,
    confidence: 0.95,
  },
  confidenceScore: 0.88,
  startOffset: 0,
  duration: 2400,
  wordCount: 9,
  mergedCount: 1,
  topicId: "topic-1",
  embedding: [0.1, 0.2],
});

describe("buildPipelineTracePayload", () => {
  it("marks dropped evaluations", () => {
    const utterance = baseUtterance();
    const result: PipelineEvaluationResult = {
      dropped: true,
      dropReason: "too_short",
      runTier4: false,
      tier4Outcome: { invoked: false },
      latencies: { preFilterMs: 0.5, pipelineBudgetMs: 1 },
    };
    const trace = buildPipelineTracePayload(utterance, result);
    expect(trace.dropped).toBe(true);
    expect(trace.dropReason).toBe("too_short");
    expect(trace.terminalLine.startsWith("[pipeline] dropped=")).toBe(true);
  });

  it("includes tier summaries and terminal line markers", () => {
    const utterance = baseUtterance();
    const result: PipelineEvaluationResult = {
      dropped: false,
      runTier4: false,
      tier2StopDeepReasoning: false,
      tier1: {
        detections: [],
        technicalHit: false,
        blocklistHit: false,
      },
      tier2: {
        intent: "commitment",
        commitmentType: "timeline",
        tone: "confident",
        riskSignals: [],
        extractedData: {},
        confidence: 0.88,
      },
      tier3: {
        forceTier4: false,
        noveltyScore: 0,
        memoryMatches: [],
        ledgerMatches: [],
      },
      tier4Outcome: { invoked: false },
      tier4Response: null,
      latencies: {
        preFilterMs: 0.1,
        tier1Ms: 1,
        tier2Ms: 50,
        gateMs: 0.05,
        pipelineBudgetMs: 55,
      },
    };
    const trace = buildPipelineTracePayload(utterance, result);
    expect(trace.gate?.runTier4).toBe(false);
    expect(trace.tier4?.invoked).toBe(false);
    expect(trace.terminalLine).toContain("T2 commitment");
    expect(trace.terminalLine).toContain("T4(skipped)");
  });
});
