import { afterEach, describe, expect, it, mock } from "bun:test";

// Mock modules BEFORE importing them to prevent real module init
mock.module("@larity/infra/redis", () => ({
  redis: {
    publish: mock(() => Promise.resolve(1)),
  },
}));

mock.module("./client", () => ({
  getDeepgramClient: mock(() => ({
    listen: {
      live: mock(() => ({
        on: mock(),
        send: mock(),
        requestClose: mock(),
      })),
    },
  })),
}));

import { redis } from "@larity/infra/redis";
import { DeepgramConnection } from "./connection";
import type { TranscriptResult } from "./types";

describe("DeepgramConnection Diarization", () => {
  const sessionId = "test-session-123";

  const createConnection = () => {
    return new DeepgramConnection(sessionId);
  };

  afterEach(() => {
    (redis.publish as any).mockClear();
  });

  it("should parse speaker index 0 correctly", async () => {
    const connection = createConnection();
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "Hello world",
            confidence: 0.99,
            words: [
              {
                word: "Hello",
                start: 0,
                end: 0.5,
                confidence: 0.99,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.sessionId).toBe(sessionId);
    expect(payload.diarizationIndex).toBe(0);
    expect(payload.transcript).toBe("Hello world");
  });

  it("should parse speaker index 1 correctly", async () => {
    const connection = createConnection();
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "Another speaker",
            confidence: 0.99,
            words: [
              {
                word: "Another",
                start: 0,
                end: 0.5,
                confidence: 0.99,
                speaker: 1,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.diarizationIndex).toBe(1);
  });

  it("should default to -1 when speaker index is missing", async () => {
    const connection = createConnection();
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "Mystery speaker",
            confidence: 0.99,
            words: [
              {
                word: "Mystery",
                start: 0,
                end: 0.5,
                confidence: 0.99,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.diarizationIndex).toBe(-1);
  });

  it("should default to -1 when words array is empty", async () => {
    const connection = createConnection();
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "No words data",
            confidence: 0.99,
            words: [],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.diarizationIndex).toBe(-1);
  });

  it("should ignore empty transcripts", async () => {
    const connection = createConnection();
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "   ",
            confidence: 0.99,
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).not.toHaveBeenCalled();
  });

  it("stamps logical channel on published STT payload when logicalChannel is 1", async () => {
    const connection = new DeepgramConnection(sessionId, 1);
    const transcript: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.5,
      start: 0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "Loopback line",
            confidence: 0.99,
            words: [
              {
                word: "Loopback",
                start: 0,
                end: 0.5,
                confidence: 0.99,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.channel).toBe(1);
    expect(payload.diarizationIndex).toBe(1000);
  });

  it("should publish partials immediately without accumulation", async () => {
    const connection = createConnection();
    const partial: TranscriptResult = {
      type: "Results",
      channel_index: [0, 1],
      duration: 0.5,
      start: 0,
      is_final: false,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "I agree to personally give",
            confidence: 0.92,
            words: [
              { word: "I", start: 0, end: 0.1, confidence: 0.95, speaker: 0 },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(partial);

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.isFinal).toBe(false);
    expect(payload.transcript).toBe("I agree to personally give");
  });

  it("should accumulate intermediate finals and publish combined on speech_final", async () => {
    const connection = createConnection();

    const seg1: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 2.0,
      start: 0,
      is_final: true,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "I agree to personally give",
            confidence: 0.95,
            words: [
              {
                word: "I",
                start: 0,
                end: 0.1,
                confidence: 0.95,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    const seg2: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.0,
      start: 2.0,
      is_final: true,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "you discount of",
            confidence: 0.92,
            words: [
              {
                word: "you",
                start: 2.0,
                end: 2.2,
                confidence: 0.92,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    const seg3: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.5,
      start: 3.0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "40%",
            confidence: 0.88,
            words: [
              {
                word: "40%",
                start: 3.0,
                end: 3.5,
                confidence: 0.88,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(seg1);
    await (connection as any).handleTranscript(seg2);
    await (connection as any).handleTranscript(seg3);

    // 1 combined final — accumulated segments no longer publish separately
    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.isFinal).toBe(true);
    expect(payload.transcript).toBe(
      "I agree to personally give you discount of 40%"
    );
    expect(payload.start).toBe(0);
    expect(payload.diarizationIndex).toBe(0);
    expect(payload.confidence).toBeGreaterThan(0.9);
  });

  it("should not let partials clear accumulation state", async () => {
    const connection = createConnection();

    const seg1: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.0,
      start: 0,
      is_final: true,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "I agree",
            confidence: 0.95,
            words: [
              {
                word: "I",
                start: 0,
                end: 0.1,
                confidence: 0.95,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    const partial: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.5,
      start: 1.0,
      is_final: false,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "I agree to personally give",
            confidence: 0.93,
            words: [
              {
                word: "I",
                start: 1.0,
                end: 1.1,
                confidence: 0.95,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    const seg2: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.0,
      start: 2.0,
      is_final: true,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "to personally give",
            confidence: 0.94,
            words: [
              {
                word: "to",
                start: 2.0,
                end: 2.1,
                confidence: 0.94,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    const seg3: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 1.5,
      start: 3.0,
      is_final: true,
      speech_final: true,
      channel: {
        alternatives: [
          {
            transcript: "you discount",
            confidence: 0.9,
            words: [
              {
                word: "you",
                start: 3.0,
                end: 3.2,
                confidence: 0.9,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(seg1);
    await (connection as any).handleTranscript(partial);
    await (connection as any).handleTranscript(seg2);
    await (connection as any).handleTranscript(seg3);

    // Should publish the raw partial (prepend skipped: starts with accumulated) + the combined final
    expect(redis.publish).toHaveBeenCalledTimes(2);
    const call = (redis.publish as any).mock.calls[1];
    const payload = JSON.parse(call[1]);

    expect(payload.isFinal).toBe(true);
    expect(payload.transcript).toBe("I agree to personally give you discount");
  });

  it("should flush accumulated text as final on close", async () => {
    const connection = createConnection();

    const seg1: TranscriptResult = {
      type: "Results",
      channel_index: [0],
      duration: 2.0,
      start: 0,
      is_final: true,
      speech_final: false,
      channel: {
        alternatives: [
          {
            transcript: "This text was never speech_final",
            confidence: 0.95,
            words: [
              {
                word: "This",
                start: 0,
                end: 0.1,
                confidence: 0.95,
                speaker: 0,
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(seg1);

    // Accumulation no longer publishes separately
    expect(redis.publish).not.toHaveBeenCalled();

    connection.close();

    expect(redis.publish).toHaveBeenCalledTimes(1);
    const call = (redis.publish as any).mock.calls[0];
    const payload = JSON.parse(call[1]);

    expect(payload.isFinal).toBe(true);
    expect(payload.transcript).toBe("This text was never speech_final");
  });
});
