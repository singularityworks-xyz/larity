import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Alert } from "../../src/alerts/types";
import type { Commitment } from "../../src/commitment/types";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { CostManager } from "../../src/cost/manager";
import { MeetingPipelineEngine } from "../../src/pipeline/engine";
import { PreFilter } from "../../src/pipeline/pre-filter";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import { Tier2Classifier } from "../../src/pipeline/tier2";
import { Tier2SemanticCache } from "../../src/pipeline/tier2-cache";
import { Tier4DeepReasoner } from "../../src/pipeline/tier4";
import { TopicManager } from "../../src/topic/manager";
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

describe("Day 28 — Semantic Cache, Cost Caps, Topic Refinement", () => {
  let publishedAlerts: Alert[];

  beforeEach(() => {
    publishedAlerts = [];
  });

  it("contradiction E2E: Tier 3 ledger match triggers Tier 4 self-contradiction alert", async () => {
    const sessionId = "day28-contradiction";
    const com = makeCommitment({ id: "day28-commit-1" });

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
        addCommitment: async () => com,
        search: () => [{ id: com.id, score: 0.91 }],
        getAll: () => [com],
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Delivery timeline",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: async () => ({
          text: JSON.stringify({
            intent: "commitment",
            commitmentType: "timeline",
            tone: "confident",
            riskSignals: ["backtracking"],
            extractedData: { deadline: "Friday" },
            confidence: 0.91,
          }),
          promptTokens: 50,
          completionTokens: 30,
        }),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: (_prompt, _timeout) =>
          Promise.resolve(
            JSON.stringify({
              alertType: "self_contradiction",
              severity: "high",
              message: "New timeline contradicts earlier commitment.",
              surfaceReason:
                "Previously promised two weeks, now saying Friday.",
              suggestion:
                "Clarify which timeline is correct and update the team.",
              confidence: 0.88,
              shouldSurface: true,
              reasoning:
                "Ledger match shows prior two-week commitment; current utterance states Friday.",
              routing: "personal",
              targetUserId: "user-alice",
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
      text: "Actually, delivery is pushed to Friday.",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      embedding: [0.2, 0.4, 0.65],
    });

    const start = performance.now();
    const result = await engine.evaluateUtterance(utterance);
    const elapsed = performance.now() - start;

    expect(result.dropped).toBe(false);
    expect(result.tier3?.forceTier4).toBe(true);
    expect(result.runTier4).toBe(true);
    expect(result.tier4Outcome?.invoked).toBe(true);
    expect(result.tier4Outcome?.surfaced).toBe(true);
    expect(publishedAlerts).toHaveLength(1);
    expect(publishedAlerts[0]?.category).toBe("self_contradiction");
    expect(elapsed).toBeLessThan(800);
  });

  it("topic summary sync: applyTier2TopicDelta updates state even when summarization fails", async () => {
    const publisher = {
      publish: mock(async () => 1),
      hset: mock(async () => 1),
    };

    // Disable async summarization to avoid real LLM calls during unit test.
    // The test verifies that applyTier2TopicDelta (reducer state) is the live source of truth.
    const manager = new TopicManager(publisher, {
      enableAsyncSummarization: false,
    });

    const u1 = createTestUtterance({
      sessionId: "topic-sync-test",
      text: "We should deliver this by next week.",
    });

    const topicId = await manager.assignTopic(u1);

    // applyTier2TopicDelta updates the live summary (reducer state)
    await manager.applyTier2TopicDelta("topic-sync-test", topicId, {
      commitment: "Deliver by next week",
      deadline: "next week",
      owner: "Alice",
    });

    // Get the topic state and verify it was updated
    const topics = manager.getTopics("topic-sync-test");
    const topic = topics.find((t) => t.topicId === topicId);
    expect(topic).toBeDefined();
    expect(topic?.summary).toContain("Deliver by next week");

    // Manually close session — triggerSummarization will attempt LLM but
    // the topic state from applyTier2TopicDelta should already be correct
    await manager.closeSession("topic-sync-test");
  });

  it("cost cap regression: cost hard cap disables Tier 4 at the limit", async () => {
    const sessionId = "day28-cost-cap";

    // Use a CostManager with a pre-seeded Redis (mock-level) or use
    // the real cost logic via the engine. We'll simulate by pre-populating.
    const costManager = new CostManager();

    // Prime the cost to just above the 80% warning threshold
    // using the in-memory fallback (works without Redis in CI)
    costManager._seedCost(sessionId, 1.65);
    const seededCost = await costManager.getSessionCost(sessionId);
    expect(seededCost).toBeGreaterThanOrEqual(1.6);

    const engine = new MeetingPipelineEngine({
      costManager,
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
        invoke: async () => ({
          text: JSON.stringify({
            intent: "commitment",
            commitmentType: null,
            tone: "neutral",
            riskSignals: [],
            extractedData: {},
            confidence: 0.9,
          }),
          promptTokens: 50,
          completionTokens: 30,
        }),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: () =>
          Promise.resolve(
            JSON.stringify({
              alertType: "risky_commitment",
              severity: "medium",
              message: "Test alert.",
              surfaceReason: "Test reason for surfacing this alert.",
              suggestion: "Test suggestion for what to do next.",
              confidence: 0.85,
              shouldSurface: true,
              reasoning: "Test reasoning trace.",
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

    // At 80% (warning mode), with no risk signals, Tier 4 should be suppressed
    const u1 = createTestUtterance({
      sessionId,
      text: "We can do this with no risk signals.",
      speaker: createTeamSpeaker("user-alice", "Alice", {
        speakerId: "spk_alice",
      }),
      embedding: [0.1, 0.2, 0.3],
    });

    const result1 = await engine.evaluateUtterance(u1);

    // Tier2 reports riskSignals=[] so in warning mode Tier4 should be suppressed
    expect(result1.runTier4).toBe(false);
    expect(result1.tier4Outcome?.invoked).toBe(false);

    // Now push cost over the hard cap ($2.00) even with risk signals
    costManager._seedCost(sessionId, 2.05);
    const hardCapCost = await costManager.getSessionCost(sessionId);
    expect(hardCapCost).toBeGreaterThanOrEqual(2.0);

    const u2 = createTestUtterance({
      sessionId,
      text: "This has risk signals for real!",
      speaker: createTeamSpeaker("user-alice", "Alice", {
        speakerId: "spk_alice",
      }),
      embedding: [0.1, 0.2, 0.3],
    });

    const result2 = await engine.evaluateUtterance(u2);
    expect(result2.runTier4).toBe(false);
    expect(result2.tier4Outcome?.invoked).toBe(false);

    await costManager.closeSession(sessionId);
  });

  it("semantic cache hit skips Tier 2 LLM on repeated utterance", async () => {
    const sessionId = "day28-cache-test";

    let invokeCount = 0;

    const cache = new Tier2SemanticCache();
    const engine = new MeetingPipelineEngine({
      tier2Cache: cache,
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
        invoke: (_input, _timeout) => {
          invokeCount++;
          return {
            text: JSON.stringify({
              intent: "commitment",
              commitmentType: "timeline",
              tone: "confident",
              riskSignals: [],
              extractedData: { deadline: "Friday" },
              confidence: 0.9,
            }),
            promptTokens: 50,
            completionTokens: 30,
          };
        },
      }),
    });

    const utterance1 = createTestUtterance({
      sessionId,
      text: "We will deliver by Friday.",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    });

    // First call — should invoke LLM
    const r1 = await engine.evaluateUtterance(utterance1);
    expect(r1.tier2?.intent).toBe("commitment");
    expect(invokeCount).toBe(1);

    // Second call with same embedding but different text (avoids pre-filter near-duplicate)
    // Should hit semantic cache (cosine ~1.0 for identical embeddings)
    const r2 = await engine.evaluateUtterance({
      ...utterance1,
      utteranceId: "test-session:1",
      text: "I confirm we will complete this by Friday deadline.",
    });
    expect(r2.tier2?.intent).toBe("commitment");
    expect(invokeCount).toBe(1); // still 1 — cache hit!

    // Third call with very close embedding — should hit cache
    const r3 = await engine.evaluateUtterance({
      ...utterance1,
      utteranceId: "test-session:2",
      text: "We guarantee delivery by end of week.",
      embedding: [0.1001, 0.2001, 0.3001, 0.4001, 0.5001],
    });
    expect(r3.tier2?.intent).toBe("commitment");
    expect(invokeCount).toBe(1); // still 1 — semantic cache hit!
  });

  it("parallel tier execution: max(t1,t2,t3) not sum", async () => {
    const sessionId = "day28-parallel";

    // Create a Tier2Classifier with an artificial delay to test parallelism
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
        invoke: async (_input, _timeout) => {
          await new Promise((r) => setTimeout(r, 50));
          return {
            text: JSON.stringify({
              intent: "commitment",
              commitmentType: "timeline",
              tone: "confident",
              riskSignals: [],
              extractedData: {},
              confidence: 0.88,
            }),
            promptTokens: 50,
            completionTokens: 30,
          };
        },
      }),
    });

    const start = performance.now();
    const result = await engine.evaluateUtterance(
      createTestUtterance({
        sessionId,
        text: "We commit to this.",
        embedding: [0.1, 0.2, 0.3],
      })
    );
    const elapsed = performance.now() - start;

    // Tier1 and Tier3 run in parallel with Tier2 — all should finish
    // in roughly max(t1, t2, t3) not sum. Tier2 takes ~50ms, others
    // are fast, so total should be < 100ms (with buffer for overhead).
    expect(elapsed).toBeLessThan(150);
    expect(result.tier1).toBeDefined();
    expect(result.tier2).toBeDefined();
    expect(result.tier3).toBeDefined();
  });
  it("enforces strict latency budgets for each tier", async () => {
    const sessionId = "day28-latency-budgets";
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
        invoke: async () => ({
          text: JSON.stringify({
            intent: "commitment",
            commitmentType: "timeline",
            tone: "confident",
            riskSignals: ["backtracking"],
            extractedData: { deadline: "Friday" },
            confidence: 0.91,
          }),
          promptTokens: 50,
          completionTokens: 30,
        }),
      }),
      tier4: new Tier4DeepReasoner({
        invoke: () =>
          Promise.resolve(
            JSON.stringify({
              alertType: "self_contradiction",
              severity: "high",
              message: "Test message",
              surfaceReason: "Test surface",
              suggestion: "Test suggestion",
              confidence: 0.88,
              shouldSurface: true,
              reasoning: "Test reasoning",
              routing: "personal",
              targetUserId: "user-alice",
            })
          ),
      }),
      tier4Alerts: {
        publish: (): Promise<void> => Promise.resolve(),
      },
    });

    const start = performance.now();
    const result = await engine.evaluateUtterance(
      createTestUtterance({
        sessionId,
        text: "Actually, delivery is pushed to Friday.",
        speaker: createTeamSpeaker("user-alice", "Alice"),
        embedding: [0.2, 0.4, 0.65],
      })
    );
    const endToEndElapsed = performance.now() - start;

    expect(result.latencies).toBeDefined();
    expect(result.latencies.preFilterMs).toBeLessThan(10);
    expect(result.latencies.tier1Ms).toBeLessThan(50);
    expect(result.latencies.tier2Ms).toBeLessThan(200);
    expect(result.latencies.tier3Ms ?? 0).toBeLessThan(100);

    if (result.tier4Outcome?.invoked) {
      expect(result.latencies.tier4Ms).toBeLessThan(500);
    }

    expect(result.latencies.pipelineBudgetMs).toBeLessThan(800);
    expect(endToEndElapsed).toBeLessThan(800);
  });
});
