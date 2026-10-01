import { beforeEach, describe, expect, test } from "bun:test";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import { getMetricsSnapshot, resetMetrics } from "./metrics";
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

function makeEngine(onAlert: () => void): MeetingPipelineEngine {
  const tier2 = new Tier2Classifier({
    invoke: () =>
      Promise.resolve({
        completionTokens: 5,
        promptTokens: 50,
        text: JSON.stringify({
          commitmentType: null,
          confidence: 0.9,
          extractedData: {},
          intent: "concern",
          riskSignals: ["test risk"],
          tone: "neutral",
        }),
      }),
  });
  const tier4 = new Tier4DeepReasoner({
    invoke: () =>
      Promise.resolve(
        JSON.stringify({
          alertType: "risky_commitment",
          confidence: 0.9,
          message: "Test alert headline",
          reasoning: "test reasoning here",
          routing: "shared",
          severity: "high",
          shouldSurface: true,
          surfaceReason: "Because the speaker committed.",
          suggestion: "Confirm the deadline explicitly.",
        })
      ),
  });
  return new MeetingPipelineEngine({
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
    tier2,
    tier4,
    tier4Alerts: {
      publish: () => {
        onAlert();
        return Promise.resolve();
      },
    },
  });
}

describe("MeetingPipelineEngine metrics", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("records per-tier latencies, speculative miss, and utterance-to-alert", async () => {
    let alerts = 0;
    const engine = makeEngine(() => {
      alerts += 1;
    });

    const result = await engine.evaluateUtterance(makeUtterance(), {
      queuedAtMs: Date.now() - 50,
    });

    expect(result.dropped).toBe(false);
    expect(result.runTier4).toBe(true);
    expect(alerts).toBeGreaterThan(0);

    const snap = getMetricsSnapshot();
    expect(snap.histograms["pipeline.tier2_ms"]?.count).toBe(1);
    expect(snap.histograms["pipeline.tier3_ms"]?.count).toBe(1);
    expect(snap.histograms["pipeline.tier4_ms"]?.count).toBe(1);
    expect(snap.counters["pipeline.speculative_misses_total"]).toBe(1);
    expect(
      snap.histograms["pipeline.utterance_to_alert_ms"]?.count
    ).toBeGreaterThanOrEqual(1);
  });

  test("queued evaluation records queue wait", async () => {
    const engine = makeEngine(() => undefined);
    engine.evaluateUtteranceQueued(makeUtterance());

    const deadline = Date.now() + 5000;
    while (
      getMetricsSnapshot().histograms["pipeline.tier2_ms"] === undefined &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(
      getMetricsSnapshot().histograms["pipeline.queue_wait_ms"]?.count
    ).toBe(1);
  });
});
