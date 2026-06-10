import { describe, expect, it } from "bun:test";
import type { Tier2Classification } from "../../src/pipeline/types";
import { SpeakerStateTracker } from "../../src/speaker-state/tracker";
import type { TopicState } from "../../src/topic/types";
import type { Utterance } from "../../src/utterance/types";

const EXTERNAL_SPEAKER = {
  speakerId: "spk_client",
  type: "EXTERNAL" as const,
  name: "Client",
  diarizationIndices: [1],
  isCurrentUser: false,
  confidence: 0.9,
};

const TEAM_SPEAKER = {
  speakerId: "spk_alice",
  type: "TEAM" as const,
  name: "Alice",
  userId: "user-alice",
  diarizationIndices: [0],
  isCurrentUser: true,
  confidence: 0.95,
};

function makeUtterance(overrides: Partial<Utterance> = {}): Utterance {
  return {
    utteranceId: `utt-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: "int-session",
    speaker: EXTERNAL_SPEAKER,
    text: "Test utterance.",
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

const _AGGRESSIVE_TIER2: Tier2Classification = {
  ...NEUTRAL_TIER2,
  tone: "aggressive",
};

function makeTopic(overrides: Partial<TopicState> = {}): TopicState {
  return {
    topicId: "topic-1",
    label: "Budget Review",
    summary: "Discussing budget allocation",
    constraintsMentioned: [],
    commitmentsMentioned: [],
    riskFlags: [],
    centroid: [0.1, 0.2],
    utteranceCount: 5,
    lastUpdated: Date.now(),
    completeness: {
      hasOwner: false,
      hasDeadline: false,
      hasActionItems: false,
      hasExplicitConfirmation: false,
    },
    ...overrides,
  };
}

describe("Speaker State Integration", () => {
  it("tracks tone escalation across multiple utterances and fires tone_warning", () => {
    const tracker = new SpeakerStateTracker();
    const tones: Tier2Classification[] = [
      { ...NEUTRAL_TIER2, tone: "neutral" },
      { ...NEUTRAL_TIER2, tone: "hesitant" },
      { ...NEUTRAL_TIER2, tone: "defensive" },
      { ...NEUTRAL_TIER2, tone: "aggressive" },
    ];

    const baseTime = Date.now();
    let allAlerts: Array<{ category: string }> = [];

    for (let i = 0; i < tones.length; i++) {
      const utterance = makeUtterance({
        speaker: EXTERNAL_SPEAKER,
        timestamp: baseTime - (tones.length - i) * 300_000,
        wordCount: 10,
      });
      tracker.ingest("int-session", utterance, tones[i]);

      const alerts = tracker.checkAlerts(
        "int-session",
        utterance,
        tones[i],
        [],
        [],
        false
      );
      allAlerts = [...allAlerts, ...alerts];
    }

    const toneAlerts = allAlerts.filter((a) => a.category === "tone_warning");
    expect(toneAlerts.length).toBeGreaterThanOrEqual(1);
    expect(toneAlerts[0].severity).toBe("medium");
  });

  it("detects client disengagement from consecutive short responses", () => {
    const tracker = new SpeakerStateTracker();
    const _config = {
      disengagementMinResponses: 5,
      disengagementShortResponseWords: 3,
      disengagementConsecutiveShort: 4,
    };

    let allAlerts: Array<{ category: string }> = [];

    for (let i = 0; i < 8; i++) {
      const isShort = i >= 4;
      const utterance = makeUtterance({
        speaker: EXTERNAL_SPEAKER,
        timestamp: Date.now() - (8 - i) * 60_000,
        wordCount: isShort ? 2 : 15,
      });
      tracker.ingest("int-session", utterance, NEUTRAL_TIER2);

      const alerts = tracker.checkAlerts(
        "int-session",
        utterance,
        NEUTRAL_TIER2,
        [],
        [],
        false
      );
      allAlerts = [...allAlerts, ...alerts];
    }

    const disengageAlerts = allAlerts.filter(
      (a) => a.category === "client_disengagement"
    );
    expect(disengageAlerts.length).toBeGreaterThanOrEqual(1);
  });

  it("detects missing clarity on topic shift", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest("int-session", makeUtterance(), NEUTRAL_TIER2);

    const topicShiftTier2: Tier2Classification = {
      ...NEUTRAL_TIER2,
      topicDelta: { labelHint: "New Topic" },
    };

    const topics = [
      makeTopic({
        topicId: "topic-old",
        utteranceCount: 5,
        completeness: {
          hasOwner: false,
          hasDeadline: false,
          hasActionItems: false,
          hasExplicitConfirmation: false,
        },
      }),
      makeTopic({ topicId: "topic-new" }),
    ];

    const alerts = tracker.checkAlerts(
      "int-session",
      makeUtterance({ topicId: "topic-new" }),
      topicShiftTier2,
      topics,
      [],
      false
    );

    const clarityAlerts = alerts.filter(
      (a) => a.category === "missing_clarity"
    );
    expect(clarityAlerts.length).toBeGreaterThanOrEqual(1);
    expect(clarityAlerts[0].topicId).toBe("topic-old");
  });

  it("detects undiscussed agenda items at meeting end", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest("int-session", makeUtterance(), NEUTRAL_TIER2);

    const topics = [
      makeTopic({ label: "Budget Review" }),
      makeTopic({ label: "Timeline Planning" }),
    ];

    const alerts = tracker.checkAlerts(
      "int-session",
      makeUtterance(),
      NEUTRAL_TIER2,
      topics,
      ["Budget", "Security Review", "Timeline"],
      true
    );

    const agendaAlerts = alerts.filter(
      (a) => a.category === "undiscussed_agenda"
    );
    expect(agendaAlerts.length).toBeGreaterThanOrEqual(1);
    expect(agendaAlerts[0].message).toContain("Security Review");
  });

  it("provides speaker summaries for Tier 4 context", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest(
      "int-session",
      makeUtterance({ speaker: TEAM_SPEAKER, wordCount: 20 }),
      NEUTRAL_TIER2
    );
    tracker.ingest(
      "int-session",
      makeUtterance({ speaker: EXTERNAL_SPEAKER, wordCount: 10 }),
      NEUTRAL_TIER2
    );

    const summaries = tracker.getSummaries("int-session");
    expect(summaries).toHaveLength(2);
    expect(summaries.map((s) => s.speakerId).sort()).toEqual([
      "spk_alice",
      "spk_client",
    ]);

    const clientSummary = summaries.find((s) => s.speakerId === "spk_client");
    expect(clientSummary?.type).toBe("EXTERNAL");
    expect(clientSummary?.engagementLevel).toBe("active");
    expect(clientSummary?.toneTrajectory).toBe("stable");
  });

  it("cleans up state on closeSession", () => {
    const tracker = new SpeakerStateTracker();
    tracker.ingest("int-session", makeUtterance(), NEUTRAL_TIER2);
    expect(tracker.getSummaries("int-session")).toHaveLength(1);

    tracker.closeSession("int-session");
    expect(tracker.getSummaries("int-session")).toHaveLength(0);
  });
});
