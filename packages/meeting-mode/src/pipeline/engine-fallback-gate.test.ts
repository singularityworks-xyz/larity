import { beforeEach, describe, expect, mock, test } from "bun:test";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import { resetMetrics } from "./metrics";
import { Tier2Classifier } from "./tier2";
import { Tier4DeepReasoner } from "./tier4";

function makeUtterance(): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1.5,
    embedding: [0.5, 0.1, 0.3],
    mergedCount: 1,
    sessionId: "test-session",
    speaker: {
      confidence: 0.9,
      diarizationIndices: [0],
      isCurrentUser: false,
      isHost: true,
      name: "Tester",
      speakerId: "spk_0",
      type: "TEAM",
      userId: "u1",
    },
    startOffset: 0,
    text: "we will deliver the release by Friday",
    timestamp: Date.now() - 1000,
    utteranceId: "test-session:0",
    wordCount: 7,
  };
}

const NON_SURFACING_TIER4 = JSON.stringify({
  alertType: "none",
  confidence: 0,
  message: "no alert",
  reasoning: "nothing to surface",
  routing: "shared",
  severity: "low",
  shouldSurface: false,
});

function makeEngine(
  ledgerHits: Array<{ commitment: { id: string }; similarity: number }>,
  tier4Invoke: () => Promise<string>
): MeetingPipelineEngine {
  return new MeetingPipelineEngine({
    commitmentManager: {
      addCommitment: () => Promise.resolve(null),
      getAll: () => [],
      hydrateSession: () => Promise.resolve(null),
      search: () => ledgerHits,
    },
    constraintManager: {
      ensureHydrated: () => Promise.resolve(),
      getAll: () => [],
      processUtterance: () => Promise.resolve(null),
    },
    costManager: new CostManager(),
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
      invoke: () => Promise.reject(new Error("timeout of 3000ms exceeded")),
      timeoutMs: 50,
    }),
    tier4: new Tier4DeepReasoner({ invoke: tier4Invoke }),
    tier4Alerts: {
      publish: () => Promise.resolve(),
    },
  });
}

describe("Tier 2 fallback Tier 4 gate", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("fallback plus Tier 3 contradiction still runs Tier 4", async () => {
    const tier4Invoke = mock(() => Promise.resolve(NON_SURFACING_TIER4));
    const engine = makeEngine(
      [{ commitment: { id: "c1" }, similarity: 0.9 }],
      tier4Invoke
    );

    const result = await engine.evaluateUtterance(makeUtterance());

    expect(result.tier2StopDeepReasoning).toBe(true);
    expect(result.tier3?.forceTier4).toBe(true);
    expect(result.runTier4).toBe(true);
    expect(tier4Invoke).toHaveBeenCalledTimes(1);
  });

  test("fallback alone does not run Tier 4", async () => {
    const tier4Invoke = mock(() => Promise.resolve(NON_SURFACING_TIER4));
    const engine = makeEngine([], tier4Invoke);

    const result = await engine.evaluateUtterance(makeUtterance());

    expect(result.tier2StopDeepReasoning).toBe(true);
    expect(result.tier3?.forceTier4).toBe(false);
    expect(result.runTier4).toBe(false);
    expect(tier4Invoke).not.toHaveBeenCalled();
  });
});
