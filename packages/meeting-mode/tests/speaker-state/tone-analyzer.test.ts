import { describe, expect, it } from "bun:test";
import { analyzeToneTrajectory } from "../../src/speaker-state/tone-analyzer";
import type { SpeakerState } from "../../src/speaker-state/types";

function makeState(
  tones: Array<{ tone: string; timestamp: number; wordCount: number }>,
  overrides: Partial<SpeakerState> = {}
): SpeakerState {
  return {
    speakerId: "spk_1",
    speaker: {
      speakerId: "spk_1",
      type: "EXTERNAL",
      name: "Client",
      diarizationIndices: [1],
      isCurrentUser: false,
      confidence: 0.9,
    },
    toneHistory: tones.map((t, i) => ({
      tone: t.tone,
      timestamp: t.timestamp,
      utteranceId: `utt-${i}`,
      wordCount: t.wordCount,
    })),
    avgResponseLength: 10,
    responseFrequency: 1,
    lastSpoke: tones.length > 0 ? tones.at(-1).timestamp : 0,
    toneTrajectory: "stable",
    engagementLevel: "active",
    utteranceCount: tones.length,
    totalWords: tones.reduce((sum, t) => sum + t.wordCount, 0),
    sessionStart: 0,
    ...overrides,
  };
}

describe("analyzeToneTrajectory", () => {
  it("returns stable when fewer than 3 tone entries", () => {
    const state = makeState([
      { tone: "neutral", timestamp: 0, wordCount: 5 },
      { tone: "neutral", timestamp: 1000, wordCount: 5 },
    ]);
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("stable");
    expect(result.alert).toBeNull();
  });

  it("returns stable when all tones are neutral", () => {
    const state = makeState([
      { tone: "neutral", timestamp: 0, wordCount: 5 },
      { tone: "neutral", timestamp: 60_000, wordCount: 5 },
      { tone: "neutral", timestamp: 120_000, wordCount: 5 },
    ]);
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("stable");
    expect(result.alert).toBeNull();
  });

  it("detects escalating trajectory and fires tone_warning for EXTERNAL", () => {
    const state = makeState([
      { tone: "neutral", timestamp: 0, wordCount: 20 },
      { tone: "hesitant", timestamp: 300_000, wordCount: 15 },
      { tone: "defensive", timestamp: 600_000, wordCount: 10 },
      { tone: "aggressive", timestamp: 900_000, wordCount: 8 },
    ]);
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("escalating");
    expect(result.alert).not.toBeNull();
    expect(result.alert?.category).toBe("tone_warning");
    expect(result.alert?.severity).toBe("medium");
  });

  it("detects escalating trajectory and fires tone_warning for TEAM", () => {
    const state = makeState(
      [
        { tone: "neutral", timestamp: 0, wordCount: 20 },
        { tone: "hesitant", timestamp: 300_000, wordCount: 15 },
        { tone: "defensive", timestamp: 600_000, wordCount: 10 },
        { tone: "aggressive", timestamp: 900_000, wordCount: 8 },
      ],
      {
        speaker: {
          speakerId: "spk_0",
          type: "TEAM",
          name: "Alice",
          diarizationIndices: [0],
          isCurrentUser: false,
          confidence: 0.9,
        },
      }
    );
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("escalating");
    expect(result.alert?.severity).toBe("low");
  });

  it("detects de-escalating trajectory without alert", () => {
    const state = makeState([
      { tone: "aggressive", timestamp: 0, wordCount: 20 },
      { tone: "defensive", timestamp: 300_000, wordCount: 15 },
      { tone: "neutral", timestamp: 600_000, wordCount: 10 },
      { tone: "neutral", timestamp: 900_000, wordCount: 8 },
    ]);
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("de-escalating");
    expect(result.alert).toBeNull();
  });

  it("ignores tone entries outside the time window", () => {
    const state = makeState([
      { tone: "aggressive", timestamp: 0, wordCount: 20 },
      { tone: "aggressive", timestamp: 1000, wordCount: 15 },
      { tone: "neutral", timestamp: Date.now() - 60_000, wordCount: 10 },
      { tone: "neutral", timestamp: Date.now() - 30_000, wordCount: 8 },
    ]);
    const result = analyzeToneTrajectory(state);
    expect(result.trajectory).toBe("stable");
    expect(result.alert).toBeNull();
  });
});
