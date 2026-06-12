import { afterEach, describe, expect, it, mock } from "bun:test";

const mockTranscribeFile = mock(() => {
  return {
    results: {
      utterances: [
        {
          start: 0.1,
          end: 1.5,
          transcript: "This is a test of batch transcription.",
          speaker: 0,
          confidence: 0.98,
          words: [
            {
              word: "This",
              start: 0.1,
              end: 0.3,
              confidence: 0.99,
              speaker: 0,
            },
            { word: "is", start: 0.3, end: 0.5, confidence: 0.99, speaker: 0 },
            { word: "a", start: 0.5, end: 0.6, confidence: 0.99, speaker: 0 },
            {
              word: "test",
              start: 0.6,
              end: 0.9,
              confidence: 0.99,
              speaker: 0,
            },
            { word: "of", start: 0.9, end: 1.1, confidence: 0.99, speaker: 0 },
            {
              word: "batch",
              start: 1.1,
              end: 1.3,
              confidence: 0.99,
              speaker: 0,
            },
            {
              word: "transcription.",
              start: 1.3,
              end: 1.5,
              confidence: 0.95,
              speaker: 0,
            },
          ],
        },
      ],
    },
  };
});

mock.module("../../src/deepgram/client", () => ({
  getDeepgramClient: () => ({
    listen: {
      v1: {
        media: {
          transcribeFile: mockTranscribeFile,
        },
      },
    },
  }),
}));

import { transcribeAudioBuffer } from "../../src/deepgram/batch";

describe("transcribeAudioBuffer", () => {
  const dummyBuffer = Buffer.from([0, 1, 2, 3]);

  afterEach(() => {
    mockTranscribeFile.mockClear();
  });

  it("should successfully transcribe audio PCM buffer and format utterances", async () => {
    const result = await transcribeAudioBuffer(dummyBuffer, "audio/x-pcm");

    expect(mockTranscribeFile).toHaveBeenCalledTimes(1);

    // Verify parameters passed to transcribeFile
    const [payload, options, reqOptions] =
      mockTranscribeFile.mock.calls[0] ?? [];
    expect(payload).toEqual({ data: dummyBuffer, contentType: "audio/x-pcm" });
    expect(options).toEqual({
      model: "nova-3",
      diarize: true,
      smart_format: true,
      utterances: true,
      encoding: "linear16",
    });
    expect(reqOptions).toEqual({
      queryParams: {
        sample_rate: 16_000,
      },
    });

    // Verify result shape
    expect(result.utterances).toHaveLength(1);
    const utterance = result.utterances[0];
    expect(utterance).toBeDefined();
    if (utterance) {
      expect(utterance.start).toBe(0.1);
      expect(utterance.end).toBe(1.5);
      expect(utterance.text).toBe("This is a test of batch transcription.");
      expect(utterance.speaker).toBe(0);
      expect(utterance.confidence).toBe(0.98);

      expect(utterance.words).toBeDefined();
      expect(utterance.words).toHaveLength(7);
      const word = utterance.words?.[0];
      expect(word).toBeDefined();
      if (word) {
        expect(word.word).toBe("This");
        expect(word.start).toBe(0.1);
        expect(word.end).toBe(0.3);
        expect(word.confidence).toBe(0.99);
        expect(word.speaker).toBe(0);
      }
    }
  });

  it("should support audio/pcm and audio/L16 mimeTypes", async () => {
    await transcribeAudioBuffer(dummyBuffer, "audio/pcm");
    await transcribeAudioBuffer(dummyBuffer, "audio/L16");
    expect(mockTranscribeFile).toHaveBeenCalledTimes(2);
  });

  it("should throw for unsupported mimeTypes", async () => {
    await expect(
      transcribeAudioBuffer(dummyBuffer, "audio/wav")
    ).rejects.toThrow(
      "Unsupported mimeType: audio/wav. Only PCM types are allowed."
    );
  });

  it("should propagate errors thrown by the Deepgram client", async () => {
    mockTranscribeFile.mockImplementationOnce(() => {
      throw new Error("Deepgram API limit exceeded");
    });

    await expect(
      transcribeAudioBuffer(dummyBuffer, "audio/x-pcm")
    ).rejects.toThrow("Deepgram API limit exceeded");
  });

  it("should handle empty response or empty results gracefully", async () => {
    mockTranscribeFile.mockImplementationOnce(() => null as any);
    await expect(
      transcribeAudioBuffer(dummyBuffer, "audio/x-pcm")
    ).rejects.toThrow("Deepgram returned empty response");

    mockTranscribeFile.mockImplementationOnce(() => ({}) as any);
    await expect(
      transcribeAudioBuffer(dummyBuffer, "audio/x-pcm")
    ).rejects.toThrow("Deepgram returned empty results");
  });
});
