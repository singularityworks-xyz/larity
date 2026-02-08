import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SttResult } from "../../stt/src/types";
import { ContextAssembler } from "../src/context/context-assembler";
import type { UtterancePublisher } from "../src/utterance/finalizer";
import { UtteranceFinalizer } from "../src/utterance/finalizer";
import { RingBuffer } from "../src/utterance/ring-buffer";
import { createUnidentifiedSpeaker } from "../src/utterance/types";
import { resetUtteranceSeq } from "./helpers";

/**
 * Integration test: SttResult → UtteranceFinalizer → UtteranceMerger → RingBuffer → ContextAssembler
 *
 * Verifies the full pipeline from raw STT output through to assembled context,
 * without any external services (no Redis, no Deepgram).
 */
describe("Pipeline Integration: STT → Finalizer → Merger → RingBuffer → ContextAssembler", () => {
  let publisher: UtterancePublisher & {
    calls: Array<{ channel: string; message: string }>;
  };
  let finalizer: UtteranceFinalizer;

  beforeEach(() => {
    const calls: Array<{ channel: string; message: string }> = [];
    publisher = {
      calls,
      publish: vi.fn((channel: string, message: string) => {
        calls.push({ channel, message });
        return Promise.resolve(1);
      }),
    };
    finalizer = new UtteranceFinalizer(publisher);
    resetUtteranceSeq();
  });

  it("should process SttResult through to correct SpeakerIdentity", async () => {
    const sttResult: SttResult = {
      sessionId: "int-session",
      isFinal: true,
      transcript: "Hello from speaker zero.",
      confidence: 0.92,
      diarizationIndex: 0,
      start: 0,
      duration: 2.0,
      ts: Date.now(),
    };

    await finalizer.process(sttResult);

    // Force flush
    await finalizer.closeSession("int-session");

    expect(publisher.calls).toHaveLength(1);
    const utterance = JSON.parse(publisher.calls[0]?.message ?? "{}");

    // Verify speaker identity was created correctly
    expect(utterance.speaker.speakerId).toBe("spk_0");
    expect(utterance.speaker.type).toBe("EXTERNAL");
    expect(utterance.speaker.name).toBe("Speaker 1");
    expect(utterance.speaker.diarizationIndex).toBe(0);
    expect(utterance.speaker.isCurrentUser).toBe(false);
    expect(utterance.speaker.confidence).toBe(0);
  });

  it("should merge same-speaker utterances and separate different speakers", async () => {
    const sessionId = "merge-session";
    const now = Date.now();

    // Speaker 0 says two things quickly (should merge)
    await finalizer.process({
      sessionId,
      isFinal: true,
      transcript: "Hello",
      confidence: 0.9,
      diarizationIndex: 0,
      start: 0,
      duration: 1.0,
      ts: now,
    });

    await finalizer.process({
      sessionId,
      isFinal: true,
      transcript: "world",
      confidence: 0.95,
      diarizationIndex: 0,
      start: 1.0,
      duration: 0.5,
      ts: now + 1500,
    });

    // Speaker 1 responds (triggers flush of merged speaker 0)
    await finalizer.process({
      sessionId,
      isFinal: true,
      transcript: "Hi there.",
      confidence: 0.88,
      diarizationIndex: 1,
      start: 2.0,
      duration: 1.0,
      ts: now + 3000,
    });

    expect(publisher.calls).toHaveLength(1);
    const merged = JSON.parse(publisher.calls[0]?.message ?? "{}");

    // Merged utterance from speaker 0
    expect(merged.speaker.speakerId).toBe("spk_0");
    expect(merged.text).toContain("Hello");
    expect(merged.text).toContain("World"); // capitalized by normalizer
    expect(merged.mergedCount).toBe(2);

    // Flush speaker 1
    await finalizer.closeSession(sessionId);

    expect(publisher.calls).toHaveLength(2);
    const speaker1Utterance = JSON.parse(publisher.calls[1]?.message ?? "{}");
    expect(speaker1Utterance.speaker.speakerId).toBe("spk_1");
    expect(speaker1Utterance.speaker.name).toBe("Speaker 2");
  });

  it("should feed through to RingBuffer and ContextAssembler correctly", () => {
    const buffer = new RingBuffer({ maxSize: 50, maxAgeMs: 120_000 });
    const assembler = new ContextAssembler(buffer);

    // Simulate what finalizer would produce
    const now = Date.now();
    buffer.push({
      utteranceId: "s:0",
      sessionId: "ctx-session",
      speaker: createUnidentifiedSpeaker(0),
      text: "We should discuss pricing.",
      timestamp: now - 5000,
      confidenceScore: 0.9,
      startOffset: 0,
      duration: 2.0,
      wordCount: 5,
      mergedCount: 1,
      topicId: "pricing",
    });

    buffer.push({
      utteranceId: "s:1",
      sessionId: "ctx-session",
      speaker: createUnidentifiedSpeaker(1),
      text: "I think the rate should be lower.",
      timestamp: now - 3000,
      confidenceScore: 0.85,
      startOffset: 2.0,
      duration: 2.5,
      wordCount: 8,
      mergedCount: 1,
      topicId: "pricing",
    });

    buffer.push({
      utteranceId: "s:2",
      sessionId: "ctx-session",
      speaker: createUnidentifiedSpeaker(0),
      text: "Let me check with the team.",
      timestamp: now - 1000,
      confidenceScore: 0.92,
      startOffset: 5.0,
      duration: 1.5,
      wordCount: 6,
      mergedCount: 1,
    });

    // Test RingBuffer filters
    const bySpeaker0 = buffer.getBySpeakerId("spk_0");
    expect(bySpeaker0).toHaveLength(2);

    const bySpeaker1 = buffer.getBySpeakerId("spk_1");
    expect(bySpeaker1).toHaveLength(1);

    // Test ContextAssembler
    const context = assembler.assemble({
      maxCharacters: 2000,
      includeTimestamps: false,
    });
    expect(context.utteranceCount).toBe(3);
    expect(context.text).toContain("Speaker 1:");
    expect(context.text).toContain("Speaker 2:");
    expect(context.text).toContain("We should discuss pricing.");
    expect(context.text).toContain("I think the rate should be lower.");

    // Test topic filter
    const topicContext = assembler.assembleForTopic("pricing");
    expect(topicContext.utteranceCount).toBe(2);
    expect(topicContext.text).toContain("We should discuss pricing.");
    expect(topicContext.text).not.toContain("Let me check with the team.");

    // Test summary
    const summary = assembler.getSummary();
    expect(summary.recentUtterances).toBe(3);
    expect(summary.externalUtterances).toBe(3); // all EXTERNAL (unidentified)
    expect(summary.teamUtterances).toBe(0);
    expect(summary.uniqueSpeakers).toBe(2);
  });

  it("should handle multi-speaker conversation with speaker identification flow", () => {
    const buffer = new RingBuffer({ maxSize: 50, maxAgeMs: 120_000 });
    const assembler = new ContextAssembler(buffer);
    const now = Date.now();

    // Simulate post-identification: some speakers resolved to TEAM
    const teamAlice = {
      speakerId: "spk_0",
      type: "TEAM" as const,
      userId: "user-alice",
      name: "Alice",
      diarizationIndex: 0,
      isCurrentUser: true,
      confidence: 0.95,
    };

    const teamBob = {
      speakerId: "spk_2",
      type: "TEAM" as const,
      userId: "user-bob",
      name: "Bob",
      diarizationIndex: 2,
      isCurrentUser: false,
      confidence: 0.9,
    };

    const externalClient = createUnidentifiedSpeaker(1);

    buffer.push({
      utteranceId: "s:0",
      sessionId: "multi-session",
      speaker: teamAlice,
      text: "Welcome to the meeting.",
      timestamp: now - 10_000,
      confidenceScore: 0.95,
      startOffset: 0,
      duration: 2.0,
      wordCount: 5,
      mergedCount: 1,
    });

    buffer.push({
      utteranceId: "s:1",
      sessionId: "multi-session",
      speaker: externalClient,
      text: "Thanks for having us.",
      timestamp: now - 8000,
      confidenceScore: 0.88,
      startOffset: 2.0,
      duration: 1.5,
      wordCount: 5,
      mergedCount: 1,
    });

    buffer.push({
      utteranceId: "s:2",
      sessionId: "multi-session",
      speaker: teamBob,
      text: "Let me share the proposal.",
      timestamp: now - 5000,
      confidenceScore: 0.92,
      startOffset: 4.0,
      duration: 2.0,
      wordCount: 5,
      mergedCount: 1,
    });

    // Filter by TEAM only
    const teamContext = assembler.assemble({
      maxCharacters: 2000,
      speakerType: "TEAM",
      includeTimestamps: false,
    });
    expect(teamContext.utteranceCount).toBe(2);
    expect(teamContext.text).toContain("Alice:");
    expect(teamContext.text).toContain("Bob:");
    expect(teamContext.text).not.toContain("Speaker 2:");

    // Filter by userId
    const aliceContext = assembler.assemble({
      maxCharacters: 2000,
      userId: "user-alice",
      includeTimestamps: false,
    });
    expect(aliceContext.utteranceCount).toBe(1);
    expect(aliceContext.text).toContain("Welcome to the meeting.");

    // Summary
    const summary = assembler.getSummary();
    expect(summary.teamUtterances).toBe(2);
    expect(summary.externalUtterances).toBe(1);
    expect(summary.uniqueSpeakers).toBe(3);
  });
});
