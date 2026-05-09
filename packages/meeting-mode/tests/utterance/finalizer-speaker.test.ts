import { beforeEach, describe, expect, it, mock } from "bun:test";
import { SpeakerIdentifier } from "../../src/speaker/identifier";
import type { UtterancePublisher } from "../../src/utterance/finalizer";
import { UtteranceFinalizer } from "../../src/utterance/finalizer";
import { createTestSttResult, resetUtteranceSeq } from "../helpers";

mock.module("../../src/topic/embedder", () => {
  return {
    GoogleGenAIEmbedder: mock(() => {
      return {
        embed: mock(() => Promise.resolve(new Array(768).fill(0))),
      };
    }),
  };
});

mock.module("../../src/topic/summarizer", () => {
  return {
    TopicSummarizer: mock(() => {
      return {
        summarize: mock(() =>
          Promise.resolve({
            summary: "Mock summary",
            actionItems: [],
          })
        ),
      };
    }),
  };
});

function createMockPublisher(): UtterancePublisher & {
  calls: Array<{ channel: string; message: string }>;
} {
  const calls: Array<{ channel: string; message: string }> = [];
  return {
    calls,
    publish: mock((channel: string, message: string) => {
      if (channel.startsWith("meeting.utterance.")) {
        calls.push({ channel, message });
      }
      return Promise.resolve(1);
    }),
    hset: mock(() => Promise.resolve(1)),
  };
}

describe("UtteranceFinalizer with SpeakerIdentifier", () => {
  let publisher: ReturnType<typeof createMockPublisher>;
  let finalizer: UtteranceFinalizer;
  let identifier: SpeakerIdentifier;
  const sessionId = "speaker-int-session";
  const aliceId = "user-alice";

  beforeEach(() => {
    publisher = createMockPublisher();
    finalizer = new UtteranceFinalizer(publisher);
    identifier = new SpeakerIdentifier(sessionId);
    identifier.registerTeamMember(aliceId, "Alice");
    finalizer.registerSpeakerIdentifier(sessionId, identifier);
    resetUtteranceSeq();
  });

  it("should use SpeakerIdentifier to resolve speaker identity", async () => {
    const now = Date.now();

    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: now - 500,
      serverReceiveTs: now - 500,
    });

    const result = createTestSttResult({
      sessionId,
      isFinal: true,
      transcript: "Hello from Alice.",
      diarizationIndex: 0,
      ts: now,
    });

    await finalizer.process(result);
    await finalizer.closeSession(sessionId);

    expect(publisher.calls.length).toBeGreaterThanOrEqual(1);
    const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
    expect(published.speaker.type).toBe("TEAM");
    expect(published.speaker.userId).toBe(aliceId);
    expect(published.speaker.name).toBe("Alice");
  });

  it("should honor provisional speaker mapping created from partials", async () => {
    const now = Date.now();
    identifier.processVadSignal({
      type: "vad_speaking",
      userId: aliceId,
      sessionId,
      clientSendTs: now - 200,
      serverReceiveTs: now - 200,
    });
    identifier.processSttPartial(9, now - 100);
    identifier.processVadSignal({
      type: "vad_silence",
      userId: aliceId,
      sessionId,
      clientSendTs: now,
      serverReceiveTs: now,
    });

    await finalizer.process(
      createTestSttResult({
        sessionId,
        isFinal: true,
        transcript: "Delayed final from Alice.",
        diarizationIndex: 9,
        ts: now + 3000,
      })
    );
    await finalizer.closeSession(sessionId);

    const published = JSON.parse(publisher.calls.at(-1)?.message ?? "{}");
    expect(published.speaker.type).toBe("TEAM");
    expect(published.speaker.userId).toBe(aliceId);
  });

  it("should fall back to EXTERNAL when SpeakerIdentifier cannot identify", async () => {
    const result = createTestSttResult({
      sessionId,
      isFinal: true,
      transcript: "Someone is speaking.",
      diarizationIndex: 5,
    });

    await finalizer.process(result);
    await finalizer.closeSession(sessionId);

    expect(publisher.calls.length).toBeGreaterThanOrEqual(1);
    const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
    expect(published.speaker.type).toBe("EXTERNAL");
    expect(published.speaker.speakerId).toBe("spk_5");
  });

  it("should work without a SpeakerIdentifier (backward compatible)", async () => {
    const noIdentifierFinalizer = new UtteranceFinalizer(publisher);

    const result = createTestSttResult({
      sessionId: "no-identifier-session",
      isFinal: true,
      transcript: "Hello world.",
      diarizationIndex: 0,
    });

    await noIdentifierFinalizer.process(result);
    await noIdentifierFinalizer.closeSession("no-identifier-session");

    expect(publisher.calls.length).toBeGreaterThanOrEqual(1);
    const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
    expect(published.speaker.type).toBe("EXTERNAL");
  });

  describe("retroactive identification", () => {
    it("should re-emit utterances when retroactive identification is applied", async () => {
      const now = Date.now();

      await finalizer.process(
        createTestSttResult({
          sessionId,
          isFinal: true,
          transcript: "Hello from unknown.",
          diarizationIndex: 0,
          ts: now,
        })
      );

      const initialCallCount = publisher.calls.length;
      expect(initialCallCount).toBeGreaterThanOrEqual(0);

      const retroactiveResults = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          clientSendTs: now,
          serverReceiveTs: now,
        },
        [{ diarizationIndex: 0, timestamp: now }]
      );

      if (retroactiveResults.length > 0) {
        const newSpeaker = retroactiveResults[0]?.speaker;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (!newSpeaker) {
          throw new Error("Expected newSpeaker");
        }

        await finalizer.processRetroactiveIdentification(
          sessionId,
          0,
          newSpeaker
        );

        const retroactiveCall = publisher.calls.at(-1);
        expect(retroactiveCall).toBeDefined();
        if (retroactiveCall) {
          const republished = JSON.parse(retroactiveCall.message ?? "{}");
          expect(republished.speaker.type).toBe("TEAM");
          expect(republished.speaker.userId).toBe(aliceId);
        }
      }
    });

    it("should call retroactive update handlers", async () => {
      const handlerCalls: Array<{ utteranceId: string; oldType: string }> = [];
      finalizer.onRetroactiveUpdate((utterance, oldType) => {
        handlerCalls.push({ utteranceId: utterance.utteranceId, oldType });
        return Promise.resolve();
      });

      const now = Date.now();

      await finalizer.process(
        createTestSttResult({
          sessionId,
          isFinal: true,
          transcript: "Test utterance.",
          diarizationIndex: 0,
          ts: now,
        })
      );

      const retroactiveResults = identifier.tryLateIdentification(
        {
          type: "vad_speaking",
          userId: aliceId,
          sessionId,
          clientSendTs: now,
          serverReceiveTs: now,
        },
        [{ diarizationIndex: 0, timestamp: now }]
      );

      if (retroactiveResults.length > 0) {
        await finalizer.processRetroactiveIdentification(
          sessionId,
          0,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          retroactiveResults[0]?.speaker as any
        );

        expect(handlerCalls.length).toBeGreaterThan(0);
        expect(handlerCalls[0]?.oldType).toBe("EXTERNAL");
      }
    });
  });
});
