import { describe, expect, it } from "bun:test";
import { detectDisengagement } from "../../src/speaker-state/engagement-detector";
import type { SpeakerState } from "../../src/speaker-state/types";

function makeExternalState(
  toneEntries: Array<{ tone: string; wordCount: number; timestamp: number }>,
  overrides: Partial<SpeakerState> = {}
): SpeakerState {
  const totalWords = toneEntries.reduce((s, t) => s + t.wordCount, 0);
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
    toneHistory: toneEntries.map((t, i) => ({
      tone: t.tone,
      timestamp: t.timestamp,
      utteranceId: `utt-${i}`,
      wordCount: t.wordCount,
    })),
    avgResponseLength: totalWords / toneEntries.length || 0,
    responseFrequency: 1,
    lastSpoke: toneEntries.length > 0 ? toneEntries.at(-1).timestamp : 0,
    toneTrajectory: "stable",
    engagementLevel: "active",
    utteranceCount: toneEntries.length,
    totalWords,
    sessionStart: 0,
    ...overrides,
  };
}

describe("detectDisengagement", () => {
  it("returns active when fewer than min responses", () => {
    const state = makeExternalState([
      { tone: "neutral", wordCount: 5, timestamp: 1000 },
      { tone: "neutral", wordCount: 3, timestamp: 2000 },
    ]);
    const result = detectDisengagement(state, {
      ...state,
      disengagementMinResponses: 5,
      disengagementShortResponseWords: 3,
      disengagementConsecutiveShort: 4,
      disengagementFrequencyDropRatio: 0.5,
      toneShiftWindowMs: 900_000,
      toneShiftThreshold: 2,
      clarityRequiredFields: ["owner", "deadline", "actions"],
      agendaMatchThreshold: 0.6,
    });
    expect(result.level).toBe("active");
    expect(result.alert).toBeNull();
  });

  it("returns active for TEAM speakers (skipped)", () => {
    const state = makeExternalState([], {
      utteranceCount: 10,
      speaker: {
        speakerId: "spk_0",
        type: "TEAM",
        name: "Alice",
        diarizationIndices: [0],
        isCurrentUser: false,
        confidence: 0.9,
      },
    });
    const result = detectDisengagement(state);
    expect(result.level).toBe("active");
    expect(result.alert).toBeNull();
  });

  it("detects disengagement from consecutive short responses", () => {
    const entries: Array<{
      tone: string;
      wordCount: number;
      timestamp: number;
    }> = [
      { tone: "neutral", wordCount: 15, timestamp: 0 },
      { tone: "neutral", wordCount: 12, timestamp: 60_000 },
      { tone: "neutral", wordCount: 10, timestamp: 120_000 },
      { tone: "neutral", wordCount: 8, timestamp: 180_000 },
      { tone: "neutral", wordCount: 2, timestamp: 240_000 },
      { tone: "neutral", wordCount: 1, timestamp: 300_000 },
      { tone: "neutral", wordCount: 3, timestamp: 360_000 },
      { tone: "neutral", wordCount: 1, timestamp: 420_000 },
    ];
    const state = makeExternalState(entries);
    const result = detectDisengagement(state, {
      ...state,
      disengagementMinResponses: 5,
      disengagementShortResponseWords: 3,
      disengagementConsecutiveShort: 4,
      disengagementFrequencyDropRatio: 0.5,
      toneShiftWindowMs: 900_000,
      toneShiftThreshold: 2,
      clarityRequiredFields: ["owner", "deadline", "actions"],
      agendaMatchThreshold: 0.6,
    });
    expect(result.level).toBe("disengaged");
    expect(result.alert).not.toBeNull();
    expect(result.alert?.category).toBe("client_disengagement");
    expect(result.alert?.severity).toBe("high");
  });

  it("detects passive engagement from frequency drop", () => {
    const baseTime = 0;
    const entries: Array<{
      tone: string;
      wordCount: number;
      timestamp: number;
    }> = [];
    for (let i = 0; i < 10; i++) {
      entries.push({
        tone: "neutral",
        wordCount: 10,
        timestamp: baseTime + i * 30_000,
      });
    }
    for (let i = 0; i < 2; i++) {
      entries.push({
        tone: "neutral",
        wordCount: 5,
        timestamp: baseTime + 900_000 + i * 300_000,
      });
    }
    const state = makeExternalState(entries, {
      utteranceCount: entries.length,
      sessionStart: baseTime,
    });
    const result = detectDisengagement(state, {
      ...state,
      disengagementMinResponses: 5,
      disengagementShortResponseWords: 3,
      disengagementConsecutiveShort: 4,
      disengagementFrequencyDropRatio: 0.5,
      toneShiftWindowMs: 900_000,
      toneShiftThreshold: 2,
      clarityRequiredFields: ["owner", "deadline", "actions"],
      agendaMatchThreshold: 0.6,
    });
    expect(result.level).toBe("passive");
    expect(result.alert?.category).toBe("client_disengagement");
    expect(result.alert?.severity).toBe("medium");
  });

  it("returns active when engagement is normal", () => {
    const entries: Array<{
      tone: string;
      wordCount: number;
      timestamp: number;
    }> = [];
    for (let i = 0; i < 8; i++) {
      entries.push({
        tone: "neutral",
        wordCount: 15,
        timestamp: i * 60_000,
      });
    }
    const state = makeExternalState(entries);
    const result = detectDisengagement(state, {
      ...state,
      disengagementMinResponses: 5,
      disengagementShortResponseWords: 3,
      disengagementConsecutiveShort: 4,
      disengagementFrequencyDropRatio: 0.5,
      toneShiftWindowMs: 900_000,
      toneShiftThreshold: 2,
      clarityRequiredFields: ["owner", "deadline", "actions"],
      agendaMatchThreshold: 0.6,
    });
    expect(result.level).toBe("active");
    expect(result.alert).toBeNull();
  });
});
