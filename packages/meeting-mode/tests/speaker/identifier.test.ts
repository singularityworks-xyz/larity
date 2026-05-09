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
        clientSendTs: Date.now(),
        serverReceiveTs: Date.now(),
      });

      expect(identifier.isSpeaking(aliceId)).toBe(true);
      expect(identifier.isSpeaking(bobId)).toBe(false);
    });

    it("should track silence state", () => {
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: Date.now(),
        serverReceiveTs: Date.now(),
      });

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: Date.now() + 2000,
        serverReceiveTs: Date.now() + 2000,
      });

      expect(identifier.isSpeaking(aliceId)).toBe(false);
    });

    it("should auto-register unknown users from authenticated VAD signals", () => {
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: "unknown-user",
        sessionId,
        clientSendTs: Date.now(),
        serverReceiveTs: Date.now(),
      });

      expect(identifier.isSpeaking("unknown-user")).toBe(true);
    });
  });

  describe("partial provisional mapping", () => {
    it("creates provisional mapping from partial and confirms on final", () => {
      const now = Date.now();
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: now - 100,
        serverReceiveTs: now - 100,
      });

      identifier.processSttPartial(42, now);
      const speaker = identifier.identifySpeakerForFinal(42, now + 50);
      expect(speaker.type).toBe("TEAM");
      expect(speaker.userId).toBe(aliceId);
    });

    it("expires stale provisional mapping via TTL", () => {
      const custom = new SpeakerIdentifier(sessionId, {
        provisionalTtlMs: 100,
      });
      custom.registerTeamMember(aliceId, "Alice");
      const now = Date.now();
      custom.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: now,
        serverReceiveTs: now,
      });
      custom.processSttPartial(7, now);
      custom.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: now + 50,
        serverReceiveTs: now + 50,
      });
      const speaker = custom.identifySpeakerForFinal(7, now + 500);
      expect(speaker.type).toBe("EXTERNAL");
    });
  });

  describe("identifySpeaker", () => {
    it("should identify a team member when VAD is active during utterance", () => {
      const now = Date.now();

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      const speaker = identifier.identifySpeaker(0, now);

      expect(speaker.type).toBe("TEAM");
      expect(speaker.userId).toBe(aliceId);
      expect(speaker.name).toBe("Alice");
      expect(speaker.diarizationIndices).toContain(0);
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        clientSendTs: now - 300,
        serverReceiveTs: now - 300,
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      const first = identifier.identifySpeaker(0, now);
      expect(first.type).toBe("TEAM");

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: now + 1000,
        serverReceiveTs: now + 1000,
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      const speaker0 = identifier.identifySpeaker(0, now);
      expect(speaker0.type).toBe("TEAM");
      expect(speaker0.userId).toBe(aliceId);

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: now + 1000,
        serverReceiveTs: now + 1000,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        clientSendTs: now + 2000,
        serverReceiveTs: now + 2000,
      });

      const speaker1 = identifier.identifySpeaker(1, now + 2500);
      expect(speaker1.type).toBe("TEAM");
      expect(speaker1.userId).toBe(bobId);
    });
  });

  describe("Diarization Reassignment (B.4)", () => {
    it("should merge indices if a known user speaks after a >15s gap", () => {
      // Setup speaker at T=0
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: 1000,
        serverReceiveTs: 1000,
      });
      const firstIdentity = identifier.identifySpeaker(0, 1000); // Diarization Index 0

      // 30 second gap
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: 31_000,
        serverReceiveTs: 31_000,
      });

      // Deepgram gives them index 1 now
      const mergedIdentity = identifier.identifySpeaker(1, 31_000);

      expect(mergedIdentity.speakerId).toBe(firstIdentity.speakerId);
      expect(mergedIdentity.diarizationIndices).toContain(0);
      expect(mergedIdentity.diarizationIndices).toContain(1);
    });

    it("should create a conflict identity if a known user maps to two indices within <15s", () => {
      // Alice speaks at index 0
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: 1000,
        serverReceiveTs: 1000,
      });
      const firstIdentity = identifier.identifySpeaker(0, 1000);

      // 2 seconds later, Deepgram hallucinates index 1 for Alice
      identifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: 3000,
        serverReceiveTs: 3000,
      });
      const conflictIdentity = identifier.identifySpeaker(1, 3000);

      expect(conflictIdentity.speakerId).not.toBe(firstIdentity.speakerId);
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
          clientSendTs: now,
          serverReceiveTs: now,
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      identifier.identifySpeaker(0, now);

      const results = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          clientSendTs: now,
          serverReceiveTs: now,
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
          clientSendTs: now,
          serverReceiveTs: now,
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
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
        clientSendTs: now - 500,
        serverReceiveTs: now - 500,
      });

      identifier.identifySpeaker(0, now);

      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: now + 1000,
        serverReceiveTs: now + 1000,
      });

      identifier.processVadSignal({
        type: "vad_speaking",
        userId: bobId,
        sessionId,
        clientSendTs: now + 2000,
        serverReceiveTs: now + 2000,
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
        clientSendTs: now,
        serverReceiveTs: now,
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
        clientSendTs: now,
        serverReceiveTs: now,
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
        clientSendTs: now - 300,
        serverReceiveTs: now - 300,
      });

      const speaker = customIdentifier.identifySpeaker(0, now);
      expect(speaker.type).toBe("TEAM");
    });

    it("should use default config values", () => {
      expect(DEFAULT_SPEAKER_CONFIG.correlationWindowMs).toBe(250);
      expect(DEFAULT_SPEAKER_CONFIG.lateCorrelationWindowMs).toBe(2000);
      expect(DEFAULT_SPEAKER_CONFIG.minConfirmationSignals).toBe(1);
    });

    it("keeps hybrid correlation overhead bounded for hot path", () => {
      const perfIdentifier = new SpeakerIdentifier(sessionId);
      perfIdentifier.registerTeamMember(aliceId, "Alice");
      const base = Date.now();
      perfIdentifier.processVadSignal({
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: base,
        serverReceiveTs: base,
      });

      const start = performance.now();
      for (let i = 0; i < 10_000; i += 1) {
        perfIdentifier.processSttPartial(i, base + i);
        perfIdentifier.identifySpeakerForFinal(i, base + i + 10);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(2000);
    });
  });
});
