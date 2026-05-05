import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { MeetingPipelineEngine } from "../../src/pipeline/engine";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import type { Tier2Classifier } from "../../src/pipeline/tier2";
import type {
  Tier2Classification,
  Tier2Outcome,
} from "../../src/pipeline/types";
import { SpeculativeCache } from "../../src/speculative/cache";
import { PredictivePreloader } from "../../src/speculative/predictive-preloader";
import { SpeculativeProcessor } from "../../src/speculative/processor";
import type { PartialUtterance } from "../../src/speculative/types";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestSpeaker,
  createTestUtterance,
  resetUtteranceSeq,
} from "../helpers";

function createMockTier2(
  classification?: Partial<Tier2Classification>
): Tier2Classifier {
  const defaultClassification: Tier2Classification = {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    extractedData: {},
    confidence: 0.8,
    ...classification,
  };

  return {
    classify: vi.fn().mockResolvedValue({
      classification: defaultClassification,
      shouldStopForDeepReasoning: false,
      promptTokens: 10,
      completionTokens: 20,
    } satisfies Tier2Outcome),
  } as unknown as Tier2Classifier;
}

function createMockFinalizer() {
  return {
    getRecentSameSpeakerText: vi.fn().mockReturnValue([]),
    getRecentEmbeddings: vi.fn().mockReturnValue([]),
    getRecentUtterancesChronological: vi.fn().mockReturnValue([]),
    applyTier2TopicDelta: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockConstraintManager() {
  return {
    ensureHydrated: vi.fn().mockResolvedValue(undefined),
    processUtterance: vi.fn().mockResolvedValue({ inserted: [], skipped: [] }),
    getAll: vi.fn().mockReturnValue([]),
  };
}

function createMockCommitmentManager() {
  return {
    hydrateSession: vi.fn().mockResolvedValue(undefined),
    addCommitment: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockReturnValue([]),
    getAll: vi.fn().mockReturnValue([]),
  };
}

function createPayload(
  overrides: Partial<PreloadedContextPayload> = {}
): PreloadedContextPayload {
  return {
    version: 1,
    sessionId: "test-session",
    meetingId: "meeting-1",
    clientId: "client-1",
    orgId: "org-1",
    loadedAt: Date.now(),
    openDecisions: [],
    knownConstraints: [],
    activePolicyGuardrails: [],
    priorCommitments: [],
    clientNameList: [],
    keywordBlocklists: [],
    calendarAgendaItems: [],
    ...overrides,
  };
}

describe("Speculative Processing Integration", () => {
  let engine: MeetingPipelineEngine;
  let tier2: Tier2Classifier;
  let tier1: Tier1StructuralDetector;
  let speculativeCache: SpeculativeCache;
  let predictivePreloader: PredictivePreloader;

  beforeEach(() => {
    resetUtteranceSeq();
    tier2 = createMockTier2();
    tier1 = new Tier1StructuralDetector();
    speculativeCache = new SpeculativeCache();
    predictivePreloader = new PredictivePreloader();

    const speculativeProcessor = new SpeculativeProcessor({
      tier1,
      tier2,
      cache: speculativeCache,
    });

    engine = new MeetingPipelineEngine({
      finalizer: createMockFinalizer(),
      constraintManager: createMockConstraintManager(),
      commitmentManager: createMockCommitmentManager(),
      getContextPayload: async () => createPayload(),
      tier1,
      tier2,
      speculativeProcessor,
      predictivePreloader,
    });
  });

  afterEach(() => {
    engine.closeAll();
  });

  it("evaluatePartial feeds speculative cache, then evaluateUtterance gets a hit", async () => {
    const partial: PartialUtterance = {
      sessionId: "test-session",
      speaker: createTeamSpeaker("user-1", "Alice"),
      text: "We can deliver by Friday",
      confidence: 0.85,
      timestamp: Date.now(),
    };

    await engine.evaluatePartial(partial);

    await new Promise((r) => setTimeout(r, 100));

    const utterance = createTestUtterance({
      sessionId: "test-session",
      text: "We can deliver by Friday afternoon",
      speaker: createTeamSpeaker("user-1", "Alice"),
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.speculativeHit).toBe(true);
    expect(result.speculativeMismatchRatio).toBeLessThan(0.3);
    expect(result.speakerPriority).toBe("standard");
  });

  it("evaluateUtterance without prior partial returns speculativeHit=false", async () => {
    const utterance = createTestUtterance({
      sessionId: "test-session",
      text: "We can deliver by Friday",
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.speculativeHit).toBe(false);
  });

  it("partial with low confidence does not trigger speculation", async () => {
    const partial: PartialUtterance = {
      sessionId: "test-session",
      speaker: createTeamSpeaker("user-1", "Alice"),
      text: "We can deliver by Friday",
      confidence: 0.5,
      timestamp: Date.now(),
    };

    await engine.evaluatePartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    const utterance = createTestUtterance({
      sessionId: "test-session",
      text: "We can deliver by Friday",
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.speculativeHit).toBe(false);
  });

  it("speaker priority is set for current user utterances", async () => {
    const utterance = createTestUtterance({
      speaker: createTestSpeaker({
        type: "TEAM",
        userId: "self",
        isCurrentUser: true,
      }),
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.speakerPriority).toBe("high");
  });

  it("speaker priority is set for external utterances", async () => {
    const utterance = createTestUtterance({
      speaker: createExternalSpeaker("Client"),
    });

    const result = await engine.evaluateUtterance(utterance);
    expect(result.speakerPriority).toBe("low");
  });

  it("external low-priority speaker with moderate confidence skips Tier 4", async () => {
    tier2 = createMockTier2({
      intent: "concern",
      riskSignals: ["mild_risk"],
      confidence: 0.7,
    });

    const localEngine = new MeetingPipelineEngine({
      finalizer: createMockFinalizer(),
      constraintManager: createMockConstraintManager(),
      commitmentManager: createMockCommitmentManager(),
      getContextPayload: async () => createPayload(),
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const utterance = createTestUtterance({
      speaker: createExternalSpeaker("Client"),
    });

    const result = await localEngine.evaluateUtterance(utterance);
    expect(result.speakerPriority).toBe("low");
    expect(result.runTier4).toBe(false);

    localEngine.closeAll();
  });

  it("current user with high priority can trigger Tier 4 at lower confidence", async () => {
    tier2 = createMockTier2({
      intent: "concern",
      riskSignals: ["mild_risk"],
      confidence: 0.72,
    });

    const localEngine = new MeetingPipelineEngine({
      finalizer: createMockFinalizer(),
      constraintManager: createMockConstraintManager(),
      commitmentManager: createMockCommitmentManager(),
      getContextPayload: async () => createPayload(),
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const utterance = createTestUtterance({
      speaker: createTestSpeaker({
        type: "TEAM",
        userId: "self",
        isCurrentUser: true,
      }),
    });

    const result = await localEngine.evaluateUtterance(utterance);
    expect(result.speakerPriority).toBe("high");
    expect(result.runTier4).toBe(true);

    localEngine.closeAll();
  });

  it("predictive preloader is seeded during session hydration", async () => {
    const payload = createPayload({
      calendarAgendaItems: ["Q3 budget review"],
      activePolicyGuardrails: [
        {
          id: "gr-1",
          name: "Data Policy",
          description: "Protect data",
          ruleType: "blocklist",
          severity: "high",
          keywords: ["data", "security"],
          pattern: null,
          clientId: null,
        },
      ],
    });

    const localPreloader = new PredictivePreloader();
    const localEngine = new MeetingPipelineEngine({
      finalizer: createMockFinalizer(),
      constraintManager: createMockConstraintManager(),
      commitmentManager: createMockCommitmentManager(),
      getContextPayload: async () => payload,
      tier1: new Tier1StructuralDetector(),
      tier2: createMockTier2(),
      predictivePreloader: localPreloader,
    });

    const utterance = createTestUtterance({ sessionId: "test-session" });
    await localEngine.evaluateUtterance(utterance);

    const constraints = localPreloader.getHotConstraints("test-session");
    expect(constraints.length).toBeGreaterThan(0);

    localEngine.closeAll();
  });

  it("closeSession cleans up all speculative state", async () => {
    const utterance = createTestUtterance({ sessionId: "test-session" });
    await engine.evaluateUtterance(utterance);

    engine.closeSession("test-session");

    const result = await engine.evaluateUtterance(
      createTestUtterance({ sessionId: "test-session" })
    );
    expect(result.speculativeHit).toBe(false);
  });
});
