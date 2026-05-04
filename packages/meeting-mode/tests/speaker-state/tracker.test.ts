import { describe, expect, it } from "bun:test";
import type { Tier2Classification } from "../../src/pipeline/types";
import { SpeakerStateTracker } from "../../src/speaker-state/tracker";
import type { Utterance } from "../../src/utterance/types";

const BASE_SPEAKER = {
  speakerId: "spk_0",
  type: "TEAM" as const,
  name: "Alice",
  userId: "user-alice",
  diarizationIndices: [0],
  isCurrentUser: true,
  confidence: 0.95,
};

const EXTERNAL_SPEAKER = {
  speakerId: "spk_1",
  type: "EXTERNAL" as const,
  name: "Client",
  diarizationIndices: [1],
  isCurrentUser: false,
  confidence: 0.9,
};

function makeUtterance(overrides: Partial<Utterance> = {}): Utterance {
  return {
    utteranceId: "utt-1",
    sessionId: "session-1",
    speaker: BASE_SPEAKER,
    text: "Hello there.",
    timestamp: Date.now(),
    confidenceScore: 0.99,
    startOffset: 0,
    duration: 1000,
    wordCount: 2,
    ...overrides,
  };
}

const NEUTRAL_TIER2: Tier2Classification = {
  intent: "statement",
  commitmentType: null,
  tone: "neutral",
  riskSignals: [],
  extractedData: {},
  confidence: 0.8,
};

describe("SpeakerStateTracker", () => {
  it("initializes state on first ingest", () => {
    const tracker = new SpeakerStateTracker();
    const utterance = makeUtterance();
    tracker.ingest("session-1", utterance, NEUTRAL_TIER2);

    const state = tracker.getSpeakerState("session-1", "spk_0");
    expect(state).toBeDefined();
    expect(state?.utteranceCount).toBe(1);
    expect(state?.toneHistory).toHaveLength(1);
    expect(state?.toneHistory[0].tone).toBe("neutral");
  });

  it("updates running averages on subsequent ingests", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest(
      "session-1",
      makeUtterance({ wordCount: 10 }),
      NEUTRAL_TIER2
    );
    tracker.ingest(
      "session-1",
      makeUtterance({ wordCount: 20, utteranceId: "utt-2" }),
      NEUTRAL_TIER2
    );

    const state = tracker.getSpeakerState("session-1", "spk_0");
    expect(state?.utteranceCount).toBe(2);
    expect(state?.avgResponseLength).toBe(15);
  });

  it("maintains independent states per speaker", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest(
      "session-1",
      makeUtterance({ speaker: BASE_SPEAKER, wordCount: 10 }),
      NEUTRAL_TIER2
    );
    tracker.ingest(
      "session-1",
      makeUtterance({
        speaker: EXTERNAL_SPEAKER,
        wordCount: 5,
        utteranceId: "utt-ext",
      }),
      NEUTRAL_TIER2
    );

    const alice = tracker.getSpeakerState("session-1", "spk_0");
    const client = tracker.getSpeakerState("session-1", "spk_1");
    expect(alice?.avgResponseLength).toBe(10);
    expect(client?.avgResponseLength).toBe(5);
  });

  it("maintains independent states per session", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest(
      "session-1",
      makeUtterance({ wordCount: 10 }),
      NEUTRAL_TIER2
    );
    tracker.ingest(
      "session-2",
      makeUtterance({ wordCount: 20, sessionId: "session-2" }),
      NEUTRAL_TIER2
    );

    const s1 = tracker.getSpeakerState("session-1", "spk_0");
    const s2 = tracker.getSpeakerState("session-2", "spk_0");
    expect(s1?.avgResponseLength).toBe(10);
    expect(s2?.avgResponseLength).toBe(20);
  });

  it("clears session state on closeSession", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest("session-1", makeUtterance(), NEUTRAL_TIER2);
    tracker.closeSession("session-1");
    expect(tracker.getSpeakerState("session-1", "spk_0")).toBeUndefined();
  });

  it("clears all state on closeAll", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest("session-1", makeUtterance(), NEUTRAL_TIER2);
    tracker.ingest(
      "session-2",
      makeUtterance({ sessionId: "session-2" }),
      NEUTRAL_TIER2
    );
    tracker.closeAll();
    expect(tracker.getSpeakerState("session-1", "spk_0")).toBeUndefined();
    expect(tracker.getSpeakerState("session-2", "spk_0")).toBeUndefined();
  });

  it("returns summaries for all speakers in a session", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest(
      "session-1",
      makeUtterance({ speaker: BASE_SPEAKER }),
      NEUTRAL_TIER2
    );
    tracker.ingest(
      "session-1",
      makeUtterance({ speaker: EXTERNAL_SPEAKER, utteranceId: "utt-ext" }),
      NEUTRAL_TIER2
    );

    const summaries = tracker.getSummaries("session-1");
    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.speakerId).sort()).toEqual([
      "spk_0",
      "spk_1",
    ]);
  });

  it("deduplicates alerts within a session", () => {
    const tracker = new SpeakerStateTracker();
    const aggressiveTier2: Tier2Classification = {
      ...NEUTRAL_TIER2,
      tone: "aggressive",
    };

    for (let i = 0; i < 5; i++) {
      tracker.ingest(
        "session-1",
        makeUtterance({
          speaker: EXTERNAL_SPEAKER,
          utteranceId: `utt-${i}`,
          timestamp: Date.now() - (5 - i) * 60_000,
          wordCount: 10,
        }),
        aggressiveTier2
      );
    }

    const alerts = tracker.checkAlerts(
      "session-1",
      makeUtterance({
        speaker: EXTERNAL_SPEAKER,
        utteranceId: "utt-final",
        timestamp: Date.now(),
      }),
      aggressiveTier2,
      [],
      [],
      false
    );

    const toneAlerts = alerts.filter((a) => a.category === "tone_warning");
    expect(toneAlerts.length).toBeLessThanOrEqual(1);
  });
});
