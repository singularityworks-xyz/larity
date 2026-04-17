import { describe, expect, it } from "bun:test";
import { SpeakerIdentifier } from "../../src/speaker/identifier";

describe("Speaker Identification Integration: VAD → Correlation → Utterance Identity", () => {
  const sessionId = "int-session";
  const aliceId = "user-alice";
  const bobId = "user-bob";

  it("should identify both team members across a multi-speaker conversation", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");
    identifier.registerTeamMember(bobId, "Bob");

    const baseTs = 1_700_000_000_000;

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: baseTs,
      serverReceiveTs: baseTs,
    });

    const speaker0 = identifier.identifySpeaker(0, baseTs + 1500);
    expect(speaker0.type).toBe("TEAM");
    expect(speaker0.userId).toBe(aliceId);

    identifier.processVadSignal({
      type: "vad_silence",
      userId: aliceId,
      sessionId,
      clientSendTs: baseTs + 3000,
      serverReceiveTs: baseTs + 3000,
    });

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: bobId,
      sessionId,
      clientSendTs: baseTs + 4000,
      serverReceiveTs: baseTs + 4000,
    });

    const speaker1 = identifier.identifySpeaker(1, baseTs + 5000);
    expect(speaker1.type).toBe("TEAM");
    expect(speaker1.userId).toBe(bobId);

    identifier.processVadSignal({
      type: "vad_silence",
      userId: bobId,
      sessionId,
      clientSendTs: baseTs + 7000,
      serverReceiveTs: baseTs + 7000,
    });

    const speaker2 = identifier.identifySpeaker(2, baseTs + 8000);
    expect(speaker2.type).toBe("EXTERNAL");
  });

  it("should handle retroactive identification for late VAD signals", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");

    const now = Date.now();

    const speaker = identifier.identifySpeaker(0, now);
    expect(speaker.type).toBe("EXTERNAL");

    const results = identifier.tryLateIdentification(
      {
        type: "vad_speaking",
        userId: aliceId,
        sessionId,
        clientSendTs: now - 200,
        serverReceiveTs: now - 200,
      },
      [{ diarizationIndex: 0, timestamp: now }]
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.speaker.type).toBe("TEAM");
    expect(results[0]?.speaker.userId).toBe(aliceId);

    const cached = identifier.identifySpeaker(0, now + 5000);
    expect(cached.type).toBe("TEAM");
    expect(cached.userId).toBe(aliceId);
  });

  it("should simulate full 3-person session (2 TEAM + 1 EXTERNAL)", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");
    identifier.registerTeamMember(bobId, "Bob");

    const base = 1_700_000_000_000;

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: base,
      serverReceiveTs: base,
    });
    const spk0 = identifier.identifySpeaker(0, base + 1000);
    expect(spk0.type).toBe("TEAM");
    expect(spk0.userId).toBe(aliceId);

    identifier.processVadSignal({
      type: "vad_silence",
      userId: aliceId,
      sessionId,
      clientSendTs: base + 2000,
      serverReceiveTs: base + 2000,
    });

    const spk1 = identifier.identifySpeaker(1, base + 3000);
    expect(spk1.type).toBe("EXTERNAL");

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: bobId,
      sessionId,
      clientSendTs: base + 5000,
      serverReceiveTs: base + 5000,
    });
    const spk2 = identifier.identifySpeaker(2, base + 6000);
    expect(spk2.type).toBe("TEAM");
    expect(spk2.userId).toBe(bobId);

    identifier.processVadSignal({
      type: "vad_silence",
      userId: bobId,
      sessionId,
      clientSendTs: base + 7000,
      serverReceiveTs: base + 7000,
    });

    const spk1Again = identifier.identifySpeaker(1, base + 3000);
    expect(spk1Again.type).toBe("EXTERNAL");

    const stats = identifier.getStats();
    expect(stats.teamMembers).toBe(2);
    expect(stats.identifiedSpeakers).toBe(2);
  });

  it("should handle simultaneous speech as ambiguous", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");
    identifier.registerTeamMember(bobId, "Bob");

    const now = Date.now();

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: now - 100,
      serverReceiveTs: now - 100,
    });
    identifier.processVadSignal({
      type: "vad_speaking",
      userId: bobId,
      sessionId,
      clientSendTs: now - 50,
      serverReceiveTs: now - 50,
    });

    const speaker = identifier.identifySpeaker(0, now);
    expect(speaker.type).toBe("EXTERNAL");
  });

  it("should persist identification across multiple utterances for same diarization index", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");

    const base = Date.now();

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: base,
      serverReceiveTs: base,
    });

    const first = identifier.identifySpeaker(0, base + 1000);
    expect(first.type).toBe("TEAM");

    identifier.processVadSignal({
      type: "vad_silence",
      userId: aliceId,
      sessionId,
      clientSendTs: base + 2000,
      serverReceiveTs: base + 2000,
    });

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: base + 5000,
      serverReceiveTs: base + 5000,
    });

    const second = identifier.identifySpeaker(0, base + 6000);
    expect(second.type).toBe("TEAM");
    expect(second.userId).toBe(aliceId);
  });

  it("Clock Skew Simulation: should correct for constant client skew", () => {
    const identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");

    const base = Date.now();
    // Simulate a client that is exactly 2000ms behind the server
    const SKEW = -2000;

    // Send 10 heartbeat VAD silence events to establish median offset
    for (let i = 0; i < 10; i++) {
      const srTs = base + i * 100;
      identifier.processVadSignal({
        type: "vad_silence",
        userId: aliceId,
        sessionId,
        clientSendTs: srTs + SKEW,
        serverReceiveTs: srTs,
      });
    }

    // Now send a real VAD speaking event
    const srTs = base + 1500;
    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: srTs + SKEW,
      serverReceiveTs: srTs,
    });

    // And an STT result arrived at the server 200ms later
    const sttTimestamp = srTs + 200;
    const speaker = identifier.identifySpeaker(0, sttTimestamp);

    // It should successfully correlate because the VAD timestamp was offset-corrected internally!
    expect(speaker.type).toBe("TEAM");
    expect(speaker.userId).toBe(aliceId);
  });
});
