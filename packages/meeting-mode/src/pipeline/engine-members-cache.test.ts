import { beforeEach, describe, expect, mock, test } from "bun:test";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import { resetMetrics } from "./metrics";
import { Tier2Classifier } from "./tier2";

function makeUtterance(id: string): Utterance {
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
    utteranceId: id,
    wordCount: 7,
  };
}

const VALID_CLASSIFICATION = JSON.stringify({
  commitmentType: null,
  confidence: 0.5,
  extractedData: {},
  intent: "general",
  riskSignals: [],
  tone: "neutral",
});

describe("Tier 2 client-members session cache (P2.6)", () => {
  beforeEach(() => {
    resetMetrics();
  });

  test("members load once per session, refresh on demand", async () => {
    const getKnownClientMembers = mock(() =>
      Promise.resolve([{ id: "c1", name: "Client One" }])
    );
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
      getKnownClientMembers,
      tier2: new Tier2Classifier({
        invoke: () =>
          Promise.resolve({
            completionTokens: 5,
            promptTokens: 50,
            text: VALID_CLASSIFICATION,
          }),
      }),
    });

    await engine.evaluateUtterance(makeUtterance("test-session:0"));
    await engine.evaluateUtterance(makeUtterance("test-session:1"));
    expect(getKnownClientMembers).toHaveBeenCalledTimes(1);

    await engine.refreshSessionMembers("test-session");
    expect(getKnownClientMembers).toHaveBeenCalledTimes(2);

    // Unknown sessions are safe no-ops.
    await engine.refreshSessionMembers("nope");
    expect(getKnownClientMembers).toHaveBeenCalledTimes(3);
  });
});
