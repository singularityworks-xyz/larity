import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UtterancePublisher } from "../../src/utterance/finalizer";
import { UtteranceFinalizer } from "../../src/utterance/finalizer";
import { createTestSttResult, resetUtteranceSeq } from "../helpers";

function createMockPublisher(): UtterancePublisher & {
  calls: Array<{ channel: string; message: string }>;
} {
  const calls: Array<{ channel: string; message: string }> = [];
  return {
    calls,
    publish: vi.fn((channel: string, message: string) => {
      calls.push({ channel, message });
      return Promise.resolve(1);
    }),
  };
}

describe("UtteranceFinalizer", () => {
  let publisher: ReturnType<typeof createMockPublisher>;
  let finalizer: UtteranceFinalizer;

  beforeEach(() => {
    publisher = createMockPublisher();
    finalizer = new UtteranceFinalizer(publisher);
    resetUtteranceSeq();
  });

  describe("process", () => {
    it("should buffer non-final results without publishing", async () => {
      const partial = createTestSttResult({
        isFinal: false,
        transcript: "partial text",
      });

      await finalizer.process(partial);
      expect(publisher.calls).toHaveLength(0);
    });

    it("should create utterance with createUnidentifiedSpeaker on final result", async () => {
      const final1 = createTestSttResult({
        isFinal: true,
        transcript: "Hello world.",
        diarizationIndex: 2,
      });

      await finalizer.process(final1);

      // The merger buffers the first utterance, so we need a second to flush the first
      const final2 = createTestSttResult({
        isFinal: true,
        transcript: "Second utterance.",
        diarizationIndex: 1, // different speaker triggers flush
      });

      await finalizer.process(final2);

      expect(publisher.calls).toHaveLength(1);
      const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
      expect(published.speaker.speakerId).toBe("spk_2");
      expect(published.speaker.type).toBe("EXTERNAL");
      expect(published.speaker.name).toBe("Speaker 3");
      expect(published.speaker.diarizationIndex).toBe(2);
      expect(published.speaker.isCurrentUser).toBe(false);
      expect(published.speaker.confidence).toBe(0);
    });

    it("should skip empty transcripts", async () => {
      const empty = createTestSttResult({
        isFinal: true,
        transcript: "   ",
      });

      await finalizer.process(empty);
      expect(publisher.calls).toHaveLength(0);
    });

    it("should normalize punctuation in final utterances", async () => {
      // Send two utterances from different speakers to flush the first
      const final1 = createTestSttResult({
        isFinal: true,
        transcript: "hello world",
        diarizationIndex: 0,
      });
      const final2 = createTestSttResult({
        isFinal: true,
        transcript: "Second.",
        diarizationIndex: 1,
      });

      await finalizer.process(final1);
      await finalizer.process(final2);

      const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
      // Should be capitalized and end with period
      expect(published.text).toBe("Hello world.");
    });

    it("should use correct utteranceId format", async () => {
      const final1 = createTestSttResult({
        sessionId: "ses-abc",
        isFinal: true,
        transcript: "First.",
        diarizationIndex: 0,
      });
      const final2 = createTestSttResult({
        sessionId: "ses-abc",
        isFinal: true,
        transcript: "Second.",
        diarizationIndex: 1,
      });

      await finalizer.process(final1);
      await finalizer.process(final2);

      const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
      expect(published.utteranceId).toBe("ses-abc:0");
    });
  });

  describe("closeSession", () => {
    it("should flush pending merger and publish", async () => {
      await finalizer.process(
        createTestSttResult({
          isFinal: true,
          transcript: "Pending utterance.",
          diarizationIndex: 0,
        })
      );

      expect(publisher.calls).toHaveLength(0); // still in merger

      await finalizer.closeSession("test-session");

      expect(publisher.calls).toHaveLength(1);
      const published = JSON.parse(publisher.calls[0]?.message ?? "{}");
      expect(published.text).toBe("Pending utterance.");
    });

    it("should clean up all session state", async () => {
      await finalizer.process(
        createTestSttResult({ isFinal: true, transcript: "Test." })
      );

      await finalizer.closeSession("test-session");

      const stats = finalizer.getStats();
      expect(stats.sessionCount).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should report session count", async () => {
      await finalizer.process(
        createTestSttResult({
          sessionId: "session-1",
          isFinal: false,
          transcript: "partial",
        })
      );
      await finalizer.process(
        createTestSttResult({
          sessionId: "session-2",
          isFinal: false,
          transcript: "partial",
        })
      );

      const stats = finalizer.getStats();
      expect(stats.sessionCount).toBe(2);
    });
  });
});
