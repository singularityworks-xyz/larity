import { describe, expect, it } from "vitest";
import {
  DEFAULT_DG_CONFIG,
  type DeepgramWord,
  type TranscriptResult,
} from "../../src/deepgram/types.ts";

describe("Deepgram Types", () => {
  describe("DEFAULT_DG_CONFIG", () => {
    it("should have diarize enabled", () => {
      expect(DEFAULT_DG_CONFIG.diarize).toBe(true);
    });

    it("should use nova-3 model", () => {
      expect(DEFAULT_DG_CONFIG.model).toBe("nova-3");
    });

    it("should use linear16 encoding at 16kHz mono", () => {
      expect(DEFAULT_DG_CONFIG.encoding).toBe("linear16");
      expect(DEFAULT_DG_CONFIG.sample_rate).toBe(16_000);
      expect(DEFAULT_DG_CONFIG.channels).toBe(1);
    });

    it("should enable punctuation and smart formatting", () => {
      expect(DEFAULT_DG_CONFIG.punctuate).toBe(true);
      expect(DEFAULT_DG_CONFIG.smart_format).toBe(true);
    });

    it("should enable interim results", () => {
      expect(DEFAULT_DG_CONFIG.interim_results).toBe(true);
    });

    it("should have keepAlive enabled", () => {
      expect(DEFAULT_DG_CONFIG.keepAlive).toBe(true);
    });
  });

  describe("DeepgramWord", () => {
    it("should have optional speaker field for diarization", () => {
      const wordWithSpeaker: DeepgramWord = {
        word: "hello",
        start: 0.5,
        end: 0.8,
        confidence: 0.95,
        speaker: 0,
      };

      expect(wordWithSpeaker.speaker).toBe(0);
    });

    it("should allow speaker to be undefined", () => {
      const wordWithoutSpeaker: DeepgramWord = {
        word: "hello",
        start: 0.5,
        end: 0.8,
        confidence: 0.95,
      };

      expect(wordWithoutSpeaker.speaker).toBeUndefined();
    });
  });

  describe("TranscriptResult", () => {
    it("should carry diarization info via words", () => {
      const result: TranscriptResult = {
        type: "Results",
        channel_index: [0, 1],
        duration: 2.5,
        start: 0,
        is_final: true,
        speech_final: true,
        channel: {
          alternatives: [
            {
              transcript: "Hello world",
              confidence: 0.95,
              words: [
                {
                  word: "Hello",
                  start: 0,
                  end: 0.5,
                  confidence: 0.95,
                  speaker: 0,
                },
                {
                  word: "world",
                  start: 0.5,
                  end: 1.0,
                  confidence: 0.92,
                  speaker: 0,
                },
              ],
            },
          ],
        },
      };

      const words = result.channel.alternatives[0]?.words;
      expect(words?.[0]?.speaker).toBe(0);
      expect(words?.[1]?.speaker).toBe(0);
    });

    it("should support multiple speakers in one result", () => {
      const result: TranscriptResult = {
        type: "Results",
        channel_index: [0, 1],
        duration: 5.0,
        start: 0,
        is_final: true,
        speech_final: true,
        channel: {
          alternatives: [
            {
              transcript: "Hello there",
              confidence: 0.9,
              words: [
                {
                  word: "Hello",
                  start: 0,
                  end: 0.5,
                  confidence: 0.95,
                  speaker: 0,
                },
                {
                  word: "there",
                  start: 0.5,
                  end: 1.0,
                  confidence: 0.88,
                  speaker: 1,
                },
              ],
            },
          ],
        },
      };

      const words = result.channel.alternatives[0]?.words;
      expect(words?.[0]?.speaker).toBe(0);
      expect(words?.[1]?.speaker).toBe(1);
    });
  });
});
