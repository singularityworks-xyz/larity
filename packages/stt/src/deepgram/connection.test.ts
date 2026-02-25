import { describe, expect, it, mock } from "bun:test";
import { redis } from "../../../infra/redis";
import { DeepgramConnection } from "./connection";
import type { TranscriptResult } from "./types";

// Mock the Redis module
mock.module("../../../infra/redis", () => ({
  redis: {
    publish: mock(() => Promise.resolve(1)),
  },
}));

// Mock the Deepgram client module
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

describe("DeepgramConnection Diarization", () => {
  const sessionId = "test-session-123";

  // Helper to create a DeepgramConnection and access private methods
  const createConnection = () => {
    return new DeepgramConnection(sessionId);
  };

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

    // Call private handleTranscript
    await (connection as any).handleTranscript(transcript);

    // Verify Redis publish call
    expect(redis.publish).toHaveBeenCalled();
    const calls = (redis.publish as any).mock.calls;
    const lastCall = calls.at(-1);
    const payload = JSON.parse(lastCall[1]);

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

    const calls = (redis.publish as any).mock.calls;
    const lastCall = calls.at(-1);
    const payload = JSON.parse(lastCall[1]);

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
                // speaker is missing
              },
            ],
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    const calls = (redis.publish as any).mock.calls;
    const lastCall = calls.at(-1);
    const payload = JSON.parse(lastCall[1]);

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
            words: [], // empty words
          },
        ],
      },
    };

    await (connection as any).handleTranscript(transcript);

    const calls = (redis.publish as any).mock.calls;
    const lastCall = calls.at(-1);
    const payload = JSON.parse(lastCall[1]);

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
            transcript: "   ", // whitespace only
            confidence: 0.99,
          },
        ],
      },
    };

    // Reset mock calls before this test
    (redis.publish as any).mockClear();

    await (connection as any).handleTranscript(transcript);

    expect(redis.publish).not.toHaveBeenCalled();
  });
});
