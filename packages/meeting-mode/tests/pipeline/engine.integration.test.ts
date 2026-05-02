import { describe, expect, it } from "bun:test";
import type { Alert } from "../../src/alerts/types";
import type { Commitment } from "../../src/commitment/types";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { MeetingPipelineEngine } from "../../src/pipeline/engine";
import { PreFilter } from "../../src/pipeline/pre-filter";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import { Tier2Classifier } from "../../src/pipeline/tier2";
import { Tier4DeepReasoner } from "../../src/pipeline/tier4";
import { createTeamSpeaker, createTestUtterance } from "../helpers";

async function asyncNoop(): Promise<void> {
  await Promise.resolve();
}

function createContext(sessionId: string): PreloadedContextPayload {
  return {
    version: 1,
    sessionId,
    meetingId: "meeting-1",
    clientId: "client-1",
    orgId: "org-1",
    loadedAt: Date.now(),
    openDecisions: [],
    knownConstraints: [],
    activePolicyGuardrails: [],
    priorCommitments: [],
    clientNameList: ["Acme Corp"],
    keywordBlocklists: ["internal roadmap"],
    calendarAgendaItems: [],
  };
}

function makeCommitment(overrides: Partial<Commitment> = {}): Commitment {
  const speaker = createTeamSpeaker("user-bob", "Bob", {
    speakerId: "spk_bob",
  });
  return {
    id: "commit-ledger-1",
    statement: "Delivery in two weeks.",
    normalizedStatement: "Delivery in two weeks.",
    speaker,
    topicId: "topic-1",
    type: "timeline",
    status: "confirmed",
    timestamp: Date.now() - 60_000,
    utteranceId: "pipeline-session:0",
    embedding: [0.2, 0.4, 0.6],
    relatedCommitments: [],
    ...overrides,
  };
}

describe("pipeline/engine integration", () => {
  it("hydrates once, runs prefilter+tier1+tier2, and writes commitments", async () => {
    const sessionId = "pipeline-session";

    const committed: Array<{ statement: string; type: string }> = [];
    const appliedTopicDeltas: string[] = [];
    let hydratedCommitmentCount = 0;
    let hydratedConstraintCount = 0;
    let constraintProcessedCount = 0;

    const publishedAlerts: Alert[] = [];

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => ["Earlier we promised the migration"],
        getRecentEmbeddings: () => [],
        getRecentUtterancesChronological: () => [],
        applyTier2TopicDelta: (_sid, _tid, delta) => {
          if (delta.commitment) {
            appliedTopicDeltas.push(delta.commitment);
          }
          return Promise.resolve();
        },
      },
      constraintManager: {
        ensureHydrated: () => {
          hydratedConstraintCount += 1;
          return Promise.resolve();
        },
        processUtterance: () => {
          constraintProcessedCount += 1;
          return Promise.resolve();
        },
        getAll: () => [],
      },
      commitmentManager: {
        hydrateSession: () => {
          hydratedCommitmentCount += 1;
          return Promise.resolve();
        },
        addCommitment: (_sid, input) => {
          committed.push({ statement: input.statement, type: input.type });
          return Promise.resolve();
        },
        search: () => [],
        getAll: () => [],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Timeline",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: (_input, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              intent: "commitment",
              commitmentType: "timeline",
              tone: "confident",
              riskSignals: [],
              extractedData: { deadline: "2026-06-01" },
              confidence: 0.88,
              topicDelta: {
                commitment: "Deliver by 2026-06-01",
                deadline: "2026-06-01",
                owner: "Alice",
              },
            })
          ),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: (_prompt, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              alertType: "risky_commitment",
              severity: "medium",
              message: "Confirm scope before promising a date.",
              surfaceReason:
                "Speaker set a fixed delivery date before scope or feasibility were confirmed.",
              suggestion:
                "Offer to follow up after an internal feasibility check rather than confirming the date live.",
              confidence: 0.82,
              shouldSurface: true,
              reasoning: "Hard delivery promise without scope guardrails.",
              routing: "personal",
              targetUserId: "user-alice",
            })
          ),
      }),
      tier4Alerts: {
        publish: (_sessionId, alert: Alert): Promise<void> => {
          publishedAlerts.push(alert);
          return Promise.resolve();
        },
      },
    });

    const utterance = createTestUtterance({
      sessionId,
      topicId: "topic-1",
      text: "We will deliver this by 2026-06-01",
      speaker: createTeamSpeaker("user-alice", "Alice", {
        speakerId: "spk_alice",
      }),
    });

    const first = await engine.evaluateUtterance(utterance);

    expect(first.dropped).toBe(false);
    expect(first.tier1?.detections.length).toBeGreaterThanOrEqual(1);
    expect(first.tier2?.intent).toBe("commitment");
    expect(first.runTier4).toBe(true);
    expect(first.tier4Outcome?.invoked).toBe(true);
    expect(first.tier4Outcome?.surfaced).toBe(true);
    expect(publishedAlerts).toHaveLength(1);
    expect(publishedAlerts[0]?.triggerTier).toBe(4);
    expect(first.latencies.pipelineBudgetMs).toBeGreaterThanOrEqual(0);
    expect(committed).toHaveLength(1);
    expect(appliedTopicDeltas).toContain("Deliver by 2026-06-01");
    expect(hydratedCommitmentCount).toBe(1);
    expect(hydratedConstraintCount).toBe(1);
    expect(constraintProcessedCount).toBe(1);

    const second = await engine.evaluateUtterance(
      createTestUtterance({
        sessionId,
        topicId: "topic-1",
        text: "Yeah",
        speaker: utterance.speaker,
      })
    );

    expect(second.dropped).toBe(true);
    expect(second.dropReason).toBe("too_short");
    expect(hydratedCommitmentCount).toBe(1);
    expect(hydratedConstraintCount).toBe(1);
  });

  it("invokes Tier 4 but publishes nothing when model abstains", async () => {
    const sessionId = "pipeline-tier4-abstain";
    const publishedAlerts: Alert[] = [];

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => [],
        getRecentEmbeddings: () => [],
        getRecentUtterancesChronological: () => [],
        applyTier2TopicDelta: asyncNoop,
      },
      constraintManager: {
        ensureHydrated: asyncNoop,
        processUtterance: asyncNoop,
        getAll: () => [],
      },
      commitmentManager: {
        hydrateSession: asyncNoop,
        addCommitment: async () => makeCommitment(),
        search: () => [],
        getAll: () => [],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Scope",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: (_input, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              intent: "commitment",
              commitmentType: "scope",
              tone: "neutral",
              riskSignals: [],
              extractedData: {},
              confidence: 0.86,
            })
          ),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: (_prompt, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              alertType: "none",
              severity: "low",
              message: "n/a",
              surfaceReason: null,
              suggestion: null,
              confidence: 0.2,
              shouldSurface: false,
              reasoning: "No actionable conflict detected.",
              routing: "shared",
            })
          ),
      }),
      tier4Alerts: {
        publish: (_sid, alert): Promise<void> => {
          publishedAlerts.push(alert);
          return Promise.resolve();
        },
      },
    });

    const utterance = createTestUtterance({
      sessionId,
      topicId: "t1",
      text: "We will include the mobile app in this phase at no extra cost.",
      speaker: createTeamSpeaker("user-alice", "Alice"),
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.runTier4).toBe(true);
    expect(result.tier4Outcome?.invoked).toBe(true);
    expect(result.tier4Outcome?.surfaced).toBe(false);
    expect(publishedAlerts).toHaveLength(0);
  });

  it("does not invoke Tier 4 when Tier 2 stops despite Tier 3 ledger force", async () => {
    const sessionId = "pipeline-tier4-no-force-on-stop";
    const publishedAlerts: Alert[] = [];
    const prior = makeCommitment();

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => [],
        getRecentEmbeddings: () => [],
        getRecentUtterancesChronological: () => [],
        applyTier2TopicDelta: asyncNoop,
      },
      constraintManager: {
        ensureHydrated: asyncNoop,
        processUtterance: asyncNoop,
        getAll: () => [],
      },
      commitmentManager: {
        hydrateSession: asyncNoop,
        addCommitment: async () => prior,
        search: () => [{ id: prior.id, score: 0.91 }],
        getAll: () => [prior],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Delivery",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: (_input, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              intent: "filler",
              commitmentType: null,
              tone: "neutral",
              riskSignals: [],
              extractedData: {},
              confidence: 0.92,
            })
          ),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: () => Promise.reject(new Error("Tier4 should not run")),
      }),
      tier4Alerts: {
        publish: (_sid, alert): Promise<void> => {
          publishedAlerts.push(alert);
          return Promise.resolve();
        },
      },
    });

    const utterance = createTestUtterance({
      sessionId,
      topicId: "topic-1",
      text: "Hi everyone sounds really good okay",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      embedding: [0.2, 0.4, 0.65],
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.tier3?.forceTier4).toBe(true);
    expect(result.tier2StopDeepReasoning).toBe(true);
    expect(result.runTier4).toBe(false);
    expect(result.tier4Outcome?.invoked).toBe(false);
    expect(publishedAlerts).toHaveLength(0);
  });

  it("still invokes Tier 4 when Tier 3 forces and Tier 2 does not stop deep reasoning", async () => {
    const sessionId = "pipeline-tier4-force-with-pass";
    const publishedAlerts: Alert[] = [];
    const prior = makeCommitment();

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => [],
        getRecentEmbeddings: () => [],
        getRecentUtterancesChronological: () => [],
        applyTier2TopicDelta: asyncNoop,
      },
      constraintManager: {
        ensureHydrated: asyncNoop,
        processUtterance: asyncNoop,
        getAll: () => [],
      },
      commitmentManager: {
        hydrateSession: asyncNoop,
        addCommitment: async () => prior,
        search: () => [{ id: prior.id, score: 0.91 }],
        getAll: () => [prior],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Delivery",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: (_input, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              intent: "commitment",
              commitmentType: null,
              tone: "neutral",
              riskSignals: [],
              extractedData: {},
              confidence: 0.9,
            })
          ),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: (_prompt, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              alertType: "team_inconsistency",
              severity: "high",
              message: "New timeline conflicts with an earlier commitment.",
              surfaceReason:
                "Today's two-month timeline contradicts an earlier commitment in the ledger.",
              suggestion:
                "Align internally on dates before confirming to the customer. Call out both timelines now.",
              confidence: 0.84,
              shouldSurface: true,
              reasoning: "Ledger match against prior two-week commitment.",
              routing: "shared",
            })
          ),
      }),
      tier4Alerts: {
        publish: (_sid, alert): Promise<void> => {
          publishedAlerts.push(alert);
          return Promise.resolve();
        },
      },
    });

    const utterance = createTestUtterance({
      sessionId,
      topicId: "topic-1",
      text: "Actually we need two months, not two weeks.",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      embedding: [0.2, 0.4, 0.65],
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.tier3?.forceTier4).toBe(true);
    expect(result.runTier4).toBe(true);
    expect(result.tier4Outcome?.invoked).toBe(true);
    expect(result.tier4Outcome?.surfaced).toBe(true);
    expect(publishedAlerts).toHaveLength(1);
    expect(publishedAlerts[0]?.category).toBe("team_inconsistency");
  });

  it("does not invoke Tier 4 on high-confidence filler with no Tier 3 force", async () => {
    const sessionId = "pipeline-no-tier4";
    const publishedAlerts: Alert[] = [];

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => [],
        getRecentEmbeddings: () => [],
        getRecentUtterancesChronological: () => [],
        applyTier2TopicDelta: asyncNoop,
      },
      constraintManager: {
        ensureHydrated: asyncNoop,
        processUtterance: asyncNoop,
        getAll: () => [],
      },
      commitmentManager: {
        hydrateSession: asyncNoop,
        addCommitment: async () => makeCommitment(),
        search: () => [],
        getAll: () => [],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "General",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: (_input, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              intent: "filler",
              commitmentType: null,
              tone: "neutral",
              riskSignals: [],
              extractedData: {},
              confidence: 0.92,
            })
          ),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: () => Promise.reject(new Error("Tier4 should not run")),
      }),
      tier4Alerts: {
        publish: (_sid, alert): Promise<void> => {
          publishedAlerts.push(alert);
          return Promise.resolve();
        },
      },
    });

    const utterance = createTestUtterance({
      sessionId,
      text: "Sounds good to me overall.",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      embedding: [0.11, 0.22, 0.33],
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.runTier4).toBe(false);
    expect(result.tier4Outcome?.invoked).toBe(false);
    expect(publishedAlerts).toHaveLength(0);
  });
});
