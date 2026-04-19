import { describe, expect, it } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { MeetingPipelineEngine } from "../../src/pipeline/engine";
import { PreFilter } from "../../src/pipeline/pre-filter";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import { Tier2Classifier } from "../../src/pipeline/tier2";
import { createTeamSpeaker, createTestUtterance } from "../helpers";

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

describe("pipeline/engine integration", () => {
  it("hydrates once, runs prefilter+tier1+tier2, and writes commitments", async () => {
    const sessionId = "pipeline-session";

    const committed: Array<{ statement: string; type: string }> = [];
    const appliedTopicDeltas: string[] = [];
    let hydratedCommitmentCount = 0;
    let hydratedConstraintCount = 0;
    let constraintProcessedCount = 0;

    const engine = new MeetingPipelineEngine({
      finalizer: {
        getRecentSameSpeakerText: () => ["Earlier we promised the migration"],
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
      },
      getContextPayload: async () => createContext(sessionId),
      getCurrentTopicLabel: async () => "Timeline",
      preFilter: new PreFilter(),
      tier1: new Tier1StructuralDetector(),
      tier2: new Tier2Classifier({
        invoke: async () =>
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
          }),
      }),
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
});
