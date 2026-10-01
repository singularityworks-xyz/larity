import { beforeEach, describe, expect, test } from "bun:test";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import { getMetricsSnapshot, resetMetrics } from "./metrics";
import { Tier2Classifier } from "./tier2";

const VALID_CLASSIFICATION = JSON.stringify({
  commitmentType: null,
  confidence: 0.5,
  extractedData: {},
  intent: "general",
  riskSignals: [],
  tone: "neutral",
});

const SESSION = "hitrate-session";
const WORD_SPLIT_REGEX = /\s+/;

function makeSpeaker() {
  return {
    confidence: 1,
    diarizationIndices: [1001],
    isCurrentUser: false,
    name: "Rahul",
    speakerId: "spk_1001",
    type: "TEAM" as const,
  };
}

function makeFinal(text: string, id: string): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1.5,
    mergedCount: 1,
    sessionId: SESSION,
    speaker: makeSpeaker(),
    startOffset: 0,
    text,
    timestamp: Date.now(),
    utteranceId: id,
    wordCount: text.split(WORD_SPLIT_REGEX).length,
  };
}

function makeEngine(costManager: CostManager = new CostManager()): {
  engine: MeetingPipelineEngine;
  tier2Calls: number[];
} {
  const tier2Calls: number[] = [];
  const engine = new MeetingPipelineEngine({
    commitmentManager: {
      addCommitment: () => Promise.resolve(null),
      getAll: () => [],
      hydrateSession: () => Promise.resolve(null),
      search: () => [],
    },
    constraintManager: {
      ensureHydrated: () => Promise.resolve(),
      getAll: () => [],
      processUtterance: () => Promise.resolve(null),
    },
    costManager,
    finalizer: {
      applyTier2TopicDelta: () => Promise.resolve(),
      getRecentEmbeddings: () => [],
      getRecentSameSpeakerText: () => [],
      getRecentUtterancesChronological: () => [],
    },
    getContextPayload: () => Promise.resolve(null),
    getCurrentTopicLabel: () => Promise.resolve(undefined),
    getKnownClientMembers: () => Promise.resolve([]),
    tier2: new Tier2Classifier({
      invoke: () => {
        tier2Calls.push(Date.now());
        return Promise.resolve({
          completionTokens: 5,
          promptTokens: 50,
          text: VALID_CLASSIFICATION,
        });
      },
    }),
  });
  return { engine, tier2Calls };
}

const settle = () => new Promise((r) => setTimeout(r, 25));

/**
 * P3.6 hit-rate measurement. Deterministic harness for the mechanism the
 * one-week dogfood would measure: a matching final must reuse the
 * speculative classification (one LLM call total), a non-matching final
 * must fall through to a fresh Tier 2 call.
 */
describe("Speculative hit-rate (P3.6)", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("matching final consumes the speculation; unrelated final misses", async () => {
    const { engine, tier2Calls } = makeEngine();

    // 1) Partial speculates ("we can deliver by friday").
    await engine.evaluatePartial({
      confidence: 0.95,
      sessionId: SESSION,
      speaker: makeSpeaker(),
      text: "we can deliver by friday",
      timestamp: Date.now(),
    });
    await settle();
    expect(tier2Calls).toHaveLength(1);

    // 2) Matching final — speculation hit, no new LLM call.
    const hit = await engine.evaluateUtterance(
      makeFinal("we can deliver by friday", `${SESSION}:0`)
    );
    expect(hit.speculativeHit).toBe(true);
    expect(tier2Calls).toHaveLength(1);

    // 3) Unrelated final — miss, fresh Tier 2 call.
    const miss = await engine.evaluateUtterance(
      makeFinal("the weather is lovely today", `${SESSION}:1`)
    );
    expect(miss.speculativeHit).toBe(false);
    expect(tier2Calls).toHaveLength(2);

    const counters = getMetricsSnapshot().counters;
    const hits = counters["pipeline.speculative_hits_total"] ?? 0;
    const misses = counters["pipeline.speculative_misses_total"] ?? 0;
    expect(hits).toBe(1);
    expect(misses).toBe(1);
    expect(hits / (hits + misses)).toBeCloseTo(0.5, 10);
  });

  test("speculation is gated off when cost warning mode is active", async () => {
    const costManager = new CostManager();
    costManager._seedCost(SESSION, 1.7);
    const { engine, tier2Calls } = makeEngine(costManager);

    await engine.evaluatePartial({
      confidence: 0.95,
      sessionId: SESSION,
      speaker: makeSpeaker(),
      text: "we can deliver by friday",
      timestamp: Date.now(),
    });
    await settle();

    expect(tier2Calls).toHaveLength(0);
    expect(
      getMetricsSnapshot().counters["pipeline.speculative_cost_gated_total"]
    ).toBe(1);
  });
});
