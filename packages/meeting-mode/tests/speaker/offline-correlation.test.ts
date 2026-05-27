import { describe, expect, it } from "bun:test";
import {
  calculateTextSimilarity,
  isChannelRoleMatchOffline,
  processOfflineCorrelation,
  reconstructVadIntervals,
} from "../../src/speaker/offline-correlation";
import type { SessionSpeakerStatePayload } from "../../src/speaker/types";
import type { Utterance } from "../../src/utterance/types";

describe("Offline Speaker Correlation Engine", () => {
  describe("reconstructVadIntervals", () => {
    it("should correctly reconstruct clean speaking and silence intervals", () => {
      const history = [
        {
          userId: "user-1",
          type: "vad_speaking" as const,
          clientSendTs: 1000,
          serverReceiveTs: 1100,
          adjustedTs: 1050,
          role: "host" as const,
        },
        {
          userId: "user-1",
          type: "vad_silence" as const,
          clientSendTs: 3000,
          serverReceiveTs: 3100,
          adjustedTs: 3050,
          role: "host" as const,
        },
      ];

      const intervals = reconstructVadIntervals(history);
      expect(intervals).toHaveLength(1);
      expect(intervals[0]).toEqual({
        userId: "user-1",
        startTs: 1050,
        endTs: 3050,
        role: "host",
      });
    });

    it("should auto-close open intervals at the end of the history", () => {
      const history = [
        {
          userId: "user-1",
          type: "vad_speaking" as const,
          clientSendTs: 1000,
          serverReceiveTs: 1100,
          adjustedTs: 1050,
          role: "host" as const,
        },
      ];

      const intervals = reconstructVadIntervals(history);
      expect(intervals).toHaveLength(1);
      expect(intervals[0].userId).toBe("user-1");
      expect(intervals[0].startTs).toBe(1050);
      expect(intervals[0].endTs).toBe(2050); // lastTs + 1000
    });
  });

  describe("isChannelRoleMatchOffline", () => {
    it("should match host to channel 0 and participant to channel 1", () => {
      expect(isChannelRoleMatchOffline(0, "host")).toBe(true);
      expect(isChannelRoleMatchOffline(0, "participant")).toBe(false);
      expect(isChannelRoleMatchOffline(1, "participant")).toBe(true);
      expect(isChannelRoleMatchOffline(1, "host")).toBe(false);
      expect(isChannelRoleMatchOffline(0, undefined)).toBe(true);
    });
  });

  describe("calculateTextSimilarity", () => {
    it("should compute accurate Jaccard similarity for bigrams", () => {
      const s1 = "Hello my dear friend how are you doing";
      const s2 = "Hello my dear friend how are you";

      const sim = calculateTextSimilarity(s1, s2);
      expect(sim).toBeGreaterThan(0.7);

      const simDiff = calculateTextSimilarity(
        "completely different text here",
        "nothing matches this"
      );
      expect(simDiff).toBeLessThan(0.2);
    });

    it("should handle empty or single-word strings gracefully", () => {
      expect(calculateTextSimilarity("", "")).toBe(1.0);
      expect(calculateTextSimilarity("hello", "")).toBe(0.0);
      expect(calculateTextSimilarity("hello", "hello")).toBe(1.0);
    });
  });

  describe("processOfflineCorrelation", () => {
    const baseTime = 1_716_000_000_000; // a real modern epoch timestamp in ms

    const defaultState: SessionSpeakerStatePayload = {
      vadHistory: [
        {
          userId: "host-user",
          type: "vad_speaking" as const,
          clientSendTs: baseTime + 1000,
          serverReceiveTs: baseTime + 1000,
          adjustedTs: baseTime + 10_000,
          role: "host",
        },
        {
          userId: "host-user",
          type: "vad_silence" as const,
          clientSendTs: baseTime + 5000,
          serverReceiveTs: baseTime + 5000,
          adjustedTs: baseTime + 14_000,
          role: "host",
        },
      ],
      speakerMappings: {},
      teamMembers: [
        {
          userId: "host-user",
          name: "Alice Host",
          role: "host",
        },
      ],
    };

    const liveUtterances: Utterance[] = [];

    it("should correlate using VAD when overlap is >= 60%", () => {
      const batchSegments = [
        {
          id: "seg-1",
          text: "hello this is the host speaking",
          timestamp: 0.5, // 500ms from start (10500ms absolute offset)
          duration: 3.0, // 3000ms duration (ends at 13500ms absolute offset)
          channel: 0,
          speaker: "Host",
        },
      ];

      const results = processOfflineCorrelation({
        batchSegments,
        sessionState: defaultState,
        liveUtterances,
        connectionStartTime: baseTime + 10_000,
        hostName: "Alice Host",
      });

      expect(results[0].speaker).toBe("Alice Host");
    });

    it("should reject correlation via Spike Filter when VAD overlap is < 60%", () => {
      const batchSegments = [
        {
          id: "seg-2",
          text: "brief typing sound or cough",
          timestamp: 3.5, // 3500ms (13500ms absolute offset)
          duration: 5.0, // ends at 18500ms. Overlaps 500ms with Alice VAD (which ends at 14000ms). Overlap is 10% (< 60%)
          channel: 0,
          speaker: "Host",
        },
      ];

      const results = processOfflineCorrelation({
        batchSegments,
        sessionState: defaultState,
        liveUtterances,
        connectionStartTime: baseTime + 10_000,
        hostName: "Alice Host",
      });

      // Since spike filter rejects, it falls back to hostName for ch0
      expect(results[0].speaker).toBe("Alice Host");
    });

    it("should trigger live transcript cross-check and flag conflicts", () => {
      const batchSegments = [
        {
          id: "seg-3",
          text: "some ambiguous speech",
          timestamp: 1.0, // 11000ms absolute offset
          duration: 2.0, // ends at 13000ms
          channel: 0,
          speaker: "Host",
        },
      ];

      // Live transcript has EXTERNAL at this time
      const liveWithConflict: Utterance[] = [
        {
          utteranceId: "live-1",
          sessionId: "sess-1",
          speaker: {
            speakerId: "spk_external",
            type: "EXTERNAL",
            name: "Speaker A",
            diarizationIndices: [0],
            confidence: 1.0,
          },
          text: "different text",
          timestamp: baseTime + 10_000 + 1500, // 11500ms
          confidenceScore: 0.9,
          startOffset: 1.5,
          duration: 2.0,
          wordCount: 2,
          mergedCount: 1,
        },
      ];

      const results = processOfflineCorrelation({
        batchSegments,
        sessionState: defaultState,
        liveUtterances: liveWithConflict,
        connectionStartTime: baseTime + 10_000,
        hostName: "Alice Host",
      });

      // VAD matches Alice Host, but live cross-check conflicts (EXTERNAL), so it flags as ambiguous and falls back.
      // For channel 0, fallback remains hostName "Alice Host" or translates.
      expect(results[0].speaker).toBe("Alice Host");
    });

    it("should successfully apply textual fallback when VAD is missing or ambiguous", () => {
      const batchSegments = [
        {
          id: "seg-4",
          text: "We should implement the textual fallback feature next week",
          timestamp: 15.0, // 25000ms absolute offset (completely outside Alice VAD history)
          duration: 3.0,
          channel: 1,
          speaker: "Speaker 0",
        },
      ];

      // Live transcript has matching text and speaker
      const liveUtts: Utterance[] = [
        {
          utteranceId: "live-2",
          sessionId: "sess-1",
          speaker: {
            speakerId: "spk_user_2",
            type: "TEAM",
            userId: "user-2",
            name: "Bob Participant",
            diarizationIndices: [1],
            confidence: 1.0,
          },
          text: "We should implement the textual fallback feature next week!",
          timestamp: baseTime + 10_000 + 15_000, // 25000ms absolute epoch ms
          confidenceScore: 0.95,
          startOffset: 15.0,
          duration: 3.0,
          wordCount: 9,
          mergedCount: 1,
        },
      ];

      const results = processOfflineCorrelation({
        batchSegments,
        sessionState: defaultState,
        liveUtterances: liveUtts,
        connectionStartTime: baseTime + 10_000,
        hostName: "Alice Host",
      });

      expect(results[0].speaker).toBe("Bob Participant");
    });

    it("should translate batch speaker labels using alphabetical naming", () => {
      const batchSegments = [
        {
          id: "seg-5",
          text: "random system sound",
          timestamp: 30.0,
          duration: 2.0,
          channel: 1,
          speaker: "Speaker 0",
        },
      ];

      const results = processOfflineCorrelation({
        batchSegments,
        sessionState: defaultState,
        liveUtterances: [],
        connectionStartTime: baseTime + 10_000,
        hostName: "Alice Host",
      });

      expect(results[0].speaker).toBe("Speaker A");
    });
  });
});
