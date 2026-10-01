import { describe, expect, mock, test } from "bun:test";
import { CostManager, SPECULATIVE_COST_TRACK } from "../cost/manager";
import type { PartialUtterance } from "../speculative/types";
import { MeetingPipelineEngine } from "./engine";
import { resetMetrics } from "./metrics";
import { Tier2Classifier } from "./tier2";
import type { Tier2Input } from "./types";

function makePartial(): PartialUtterance {
  return {
    confidence: 0.95,
    sessionId: "spec-session",
    speaker: {
      confidence: 1,
      diarizationIndices: [1001],
      isCurrentUser: false,
      name: "Rahul",
      speakerId: "spk_1001",
      type: "TEAM",
    },
    text: "we can deliver by friday afternoon",
    timestamp: Date.now(),
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

function makeEngine(opts: {
  costManager: CostManager;
  onTier2Input: (input: Tier2Input) => void;
}) {
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
    costManager: opts.costManager,
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
      invoke: (input) => {
        opts.onTier2Input(input);
        return Promise.resolve({
          completionTokens: 5,
          promptTokens: 50,
          text: VALID_CLASSIFICATION,
        });
      },
    }),
  });
  return { engine, getKnownClientMembers };
}

const settle = () => new Promise((r) => setTimeout(r, 25));

describe("Speculative Tier 2 session wiring (P3.3)", () => {
  test("evaluatePartial speculates with cached members and tracked cost", async () => {
    resetMetrics();
    const costManager = new CostManager();
    const box: { input: Tier2Input | null } = { input: null };
    const { engine, getKnownClientMembers } = makeEngine({
      costManager,
      onTier2Input: (input) => {
        box.input = input;
      },
    });

    // evaluatePartial hydrates first (filling the P2.6 session cache), then
    // the throttle (fresh speaker) lets the first partial through.
    await engine.evaluatePartial({
      confidence: 0.95,
      sessionId: "spec-session",
      speaker: {
        confidence: 1,
        diarizationIndices: [1001],
        isCurrentUser: false,
        name: "Rahul",
        speakerId: "spk_1001",
        type: "TEAM",
      },
      text: "we can deliver by friday afternoon",
      timestamp: Date.now(),
    });
    await settle();

    // Members fetched once at hydration…
    expect(getKnownClientMembers).toHaveBeenCalledTimes(1);
    // …and the speculative Tier 2 call reused the session cache.
    expect(box.input).not.toBeNull();
    expect(box.input?.knownClientMembers).toEqual([
      { id: "c1", name: "Client One" },
    ]);
    // Spend is visible under its own track and in the session total.
    expect(
      await costManager.getTrackedCost("spec-session", SPECULATIVE_COST_TRACK)
    ).toBeGreaterThan(0);
    expect(await costManager.getSessionCost("spec-session")).toBeGreaterThan(0);
  });

  test("cost warning mode disables speculation (P3.5)", async () => {
    resetMetrics();
    const costManager = new CostManager();
    costManager._seedCost("spec-session", 1.7);
    const tier2Calls: Tier2Input[] = [];
    const { engine } = makeEngine({
      costManager,
      onTier2Input: (input) => {
        tier2Calls.push(input);
      },
    });

    await engine.evaluatePartial(makePartial());
    await settle();

    // Hydration still happened, but no speculative Tier 2 call fired.
    expect(tier2Calls).toHaveLength(0);
  });

  test("cost below the warning threshold still speculates (P3.5)", async () => {
    resetMetrics();
    const costManager = new CostManager();
    costManager._seedCost("spec-session", 1.5);
    const tier2Calls: Tier2Input[] = [];
    const { engine } = makeEngine({
      costManager,
      onTier2Input: (input) => {
        tier2Calls.push(input);
      },
    });

    await engine.evaluatePartial(makePartial());
    await settle();

    expect(tier2Calls).toHaveLength(1);
  });
});
