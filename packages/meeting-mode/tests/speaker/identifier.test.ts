import { beforeEach, describe, expect, it } from "bun:test";
import { SpeakerIdentifier } from "../../src/speaker/identifier";
import { DEFAULT_SPEAKER_CONFIG } from "../../src/speaker/types";

describe("SpeakerIdentifier", () => {
  let identifier: SpeakerIdentifier;
  const sessionId = "test-session";
  const aliceId = "user-alice";
  const bobId = "user-bob";

  beforeEach(() => {
    identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");
    identifier.registerTeamMember(bobId, "Bob");
  });

  describe("registerTeamMember", () => {
    it("should register team members", () => {
      expect(identifier.getTeamMemberCount()).toBe(2);
    });

    it("should not duplicate members", () => {
      identifier.registerTeamMember(aliceId, "Alice");
      expect(identifier.getTeamMemberCount()).toBe(2);
    });
  });

  describe("processVadSignal", () => {
    it("should track speaking state", () => {
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: Date.now(),
      });

      expect(identifier.isSpeaking(aliceId)).toBe(true);
      expect(identifier.isSpeaking(bobId)).toBe(false);
    });

    it("should track silence state", () => {
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: Date.now(),
      });

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        ts: Date.now() + 2000,
      });

      expect(identifier.isSpeaking(aliceId)).toBe(false);
    });

    it("should ignore VAD signals from unknown users", () => {
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: "unknown-user",
        sessionId,
        ts: Date.now(),
      });

      expect(identifier.isSpeaking("unknown-user")).toBe(false);
    });
  });

  describe("identifySpeaker", () => {
    it("should identify a team member when VAD is active during utterance", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      const speaker = identifier.identifySpeaker(0, now);

      expect(speaker.type).toBe("TEAM");
      expect(speaker.userId).toBe(aliceId);
      expect(speaker.name).toBe("Alice");
      expect(speaker.diarizationIndex).toBe(0);
    });

    it("should return EXTERNAL when no VAD is active", () => {
      const speaker = identifier.identifySpeaker(0, Date.now());

      expect(speaker.type).toBe("EXTERNAL");
      expect(speaker.speakerId).toBe("spk_0");
    });

    it("should return EXTERNAL when multiple team members speak simultaneously", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        ts: now - 300,
      });

      const speaker = identifier.identifySpeaker(0, now);

      expect(speaker.type).toBe("EXTERNAL");
    });

    it("should cache identified speakers", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      const first = identifier.identifySpeaker(0, now);
      expect(first.type).toBe("TEAM");

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        ts: now + 1000,
      });

      const second = identifier.identifySpeaker(0, now + 5000);
      expect(second.type).toBe("TEAM");
      expect(second.userId).toBe(aliceId);
    });

    it("should identify different team members for different diarization indices", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      const speaker0 = identifier.identifySpeaker(0, now);
      expect(speaker0.type).toBe("TEAM");
      expect(speaker0.userId).toBe(aliceId);

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        ts: now + 1000,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        ts: now + 2000,
      });

      const speaker1 = identifier.identifySpeaker(1, now + 2500);
      expect(speaker1.type).toBe("TEAM");
      expect(speaker1.userId).toBe(bobId);
    });
  });

  describe("tryLateIdentification", () => {
    it("should retroactively identify a speaker from late VAD signal", () => {
      const now = Date.now();

      const speaker = identifier.identifySpeaker(0, now);
      expect(speaker.type).toBe("EXTERNAL");

      const results = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          ts: now,
        },
        [{ diarizationIndex: 0, timestamp: now }]
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.speaker.type).toBe("TEAM");
      expect(results[0]?.speaker.userId).toBe(aliceId);
      expect(results[0]?.diarizationIndex).toBe(0);
    });

    it("should not re-identify already identified speakers", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      identifier.identifySpeaker(0, now);

      const results = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          ts: now,
        },
        [{ diarizationIndex: 0, timestamp: now }]
      );

      expect(results).toHaveLength(0);
    });

    it("should handle multiple pending utterances", () => {
      const now = Date.now();

      identifier.identifySpeaker(0, now);
      identifier.identifySpeaker(1, now + 1000);

      const results = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          ts: now,
        },
        [
          { diarizationIndex: 0, timestamp: now },
          { diarizationIndex: 1, timestamp: now + 1000 },
        ]
      );

      for (const result of results) {
        expect(result.speaker.type).toBe("TEAM");
        expect(result.speaker.userId).toBe(aliceId);
      }
    });
  });

  describe("getSpeakerMapping", () => {
    it("should return mapping for identified speaker", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      identifier.identifySpeaker(0, now);

      const mapping = identifier.getSpeakerMapping(0);
      expect(mapping).toBeDefined();
      expect(mapping?.speaker.type).toBe("TEAM");
      expect(mapping?.speaker.userId).toBe(aliceId);
      expect(mapping?.confidence).toBe(1);
    });

    it("should return undefined for unidentified speaker", () => {
      const mapping = identifier.getSpeakerMapping(99);
      expect(mapping).toBeUndefined();
    });
  });

  describe("getAllMappings", () => {
    it("should return all identified mappings", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 500,
      });

      identifier.identifySpeaker(0, now);

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        ts: now + 1000,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        ts: now + 2000,
      });

      identifier.identifySpeaker(1, now + 2500);

      const mappings = identifier.getAllMappings();
      expect(mappings.size).toBe(2);
      expect(mappings.get(0)?.speaker.userId).toBe(aliceId);
      expect(mappings.get(1)?.speaker.userId).toBe(bobId);
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now,
      });

      identifier.identifySpeaker(0, now);

      const stats = identifier.getStats();
      expect(stats.teamMembers).toBe(2);
      expect(stats.identifiedSpeakers).toBe(1);
      expect(stats.activeVadSignals).toBe(1);
    });
  });

  describe("reset", () => {
    it("should clear all state", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now,
      });

      identifier.identifySpeaker(0, now);
      identifier.reset();

      expect(identifier.getIdentifiedCount()).toBe(0);
      expect(identifier.isSpeaking(aliceId)).toBe(false);
    });
  });

  describe("configuration", () => {
    it("should respect custom correlation window", () => {
      const customIdentifier = new SpeakerIdentifier(sessionId, {
        correlationWindowMs: 500,
        minConfirmationSignals: 1,
      });

      customIdentifier.registerTeamMember(aliceId, "Alice");

      const now = Date.now();

      customIdentifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        ts: now - 300,
      });

      const speaker = customIdentifier.identifySpeaker(0, now);
      expect(speaker.type).toBe("TEAM");
    });

    it("should use default config values", () => {
      expect(DEFAULT_SPEAKER_CONFIG.correlationWindowMs).toBe(300);
      expect(DEFAULT_SPEAKER_CONFIG.lateCorrelationWindowMs).toBe(2000);
      expect(DEFAULT_SPEAKER_CONFIG.minConfirmationSignals).toBe(1);
    });
  });
});
