import { beforeEach, describe, expect, mock, test } from "bun:test";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import { getMetricsSnapshot, resetMetrics } from "./metrics";
import { Tier2Classifier } from "./tier2";
import { Tier4DeepReasoner } from "./tier4";

const TEXTS = [
  "we will deliver the release by Friday",
  "the client requested an additional audit trail",
  "our team confirmed the staging environment upgrade",
  "legal approved the revised data processing terms",
];

// Well-separated 3-dim vectors: every pairwise cosine is below the 0.97
// Tier 2 cache threshold, and the texts differ beyond the pre-filter
// near-duplicate gate — so all four utterances fully evaluate.
const EMBEDDINGS = [
  [0.9, 0.05, 0.01],
  [0.65, 0.25, 0.01],
  [0.4, 0.45, 0.01],
  [0.15, 0.65, 0.01],
];

function makeUtterance(index: number): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1.5,
    embedding: [...(EMBEDDINGS[index] ?? EMBEDDINGS[0] ?? [])],
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
    text: TEXTS[index] ?? TEXTS[0] ?? "",
    timestamp: Date.now() - 1000,
    utteranceId: `test-session:${index}`,
    wordCount: 7,
  };
}

const CONCERN_CLASSIFICATION = JSON.stringify({
  commitmentType: null,
  confidence: 0.9,
  extractedData: {},
  intent: "concern",
  riskSignals: ["test risk"],
  tone: "neutral",
});

const NON_SURFACING_TIER4 = JSON.stringify({
  alertType: "none",
  confidence: 0,
  message: "no alert",
  reasoning: "nothing to surface",
  routing: "shared",
  severity: "low",
  shouldSurface: false,
});

describe("Tier 4 backlog shed (P2.8)", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("oldest utterance skips Tier 4 when three wait behind it", async () => {
    const tier4Invoke = mock(() => Promise.resolve(NON_SURFACING_TIER4));
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
        invoke: () =>
          Promise.resolve({
            completionTokens: 5,
            promptTokens: 50,
            text: CONCERN_CLASSIFICATION,
          }),
      }),
      tier4: new Tier4DeepReasoner({ invoke: tier4Invoke }),
      tier4Alerts: {
        publish: () => Promise.resolve(),
      },
    });

    // Burst of 4: U1 dequeues with 3 behind it (skip), the rest run.
    engine.evaluateUtteranceQueued(makeUtterance(0));
    engine.evaluateUtteranceQueued(makeUtterance(1));
    engine.evaluateUtteranceQueued(makeUtterance(2));
    engine.evaluateUtteranceQueued(makeUtterance(3));

    const deadline = Date.now() + 5000;
    while (
      (getMetricsSnapshot().histograms["pipeline.tier4_ms"]?.count ?? 0) < 3 &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(tier4Invoke).toHaveBeenCalledTimes(3);
    expect(
      getMetricsSnapshot().counters["pipeline.tier4_skipped_backlog_total"]
    ).toBe(1);
  });

  test("no backlog means no skips", async () => {
    const tier4Invoke = mock(() => Promise.resolve(NON_SURFACING_TIER4));
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
        invoke: () =>
          Promise.resolve({
            completionTokens: 5,
            promptTokens: 50,
            text: CONCERN_CLASSIFICATION,
          }),
      }),
      tier4: new Tier4DeepReasoner({ invoke: tier4Invoke }),
      tier4Alerts: {
        publish: () => Promise.resolve(),
      },
    });

    await engine.evaluateUtterance(makeUtterance(0));

    expect(tier4Invoke).toHaveBeenCalledTimes(1);
    expect(
      getMetricsSnapshot().counters["pipeline.tier4_skipped_backlog_total"] ?? 0
    ).toBe(0);
  });
});
