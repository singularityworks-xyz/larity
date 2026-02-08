import { describe, expect, it } from "vitest";
import type { AudioPayload, SttResult } from "../src/types.ts";

describe("SttResult", () => {
  it("should have diarizationIndex instead of speaker", () => {
    const result: SttResult = {
      sessionId: "session-1",
      isFinal: true,
      transcript: "Hello world.",
      confidence: 0.95,
      diarizationIndex: 0,
      start: 0,
      duration: 2.5,
      ts: Date.now(),
    };

    expect(result.diarizationIndex).toBe(0);
    expect(result).not.toHaveProperty("speaker");
  });

  it("should accept different diarization indices", () => {
    const result: SttResult = {
      sessionId: "session-1",
      isFinal: true,
      transcript: "Test.",
      confidence: 0.9,
      diarizationIndex: 3,
      start: 5.0,
      duration: 1.2,
      ts: Date.now(),
    };

    expect(result.diarizationIndex).toBe(3);
  });

  it("should carry all required fields", () => {
    const ts = Date.now();
    const result: SttResult = {
      sessionId: "session-abc",
      isFinal: false,
      transcript: "partial transcript",
      confidence: 0.8,
      diarizationIndex: 1,
      start: 10.5,
      duration: 0.5,
      ts,
    };

    expect(result.sessionId).toBe("session-abc");
    expect(result.isFinal).toBe(false);
    expect(result.transcript).toBe("partial transcript");
    expect(result.confidence).toBe(0.8);
    expect(result.start).toBe(10.5);
    expect(result.duration).toBe(0.5);
    expect(result.ts).toBe(ts);
  });
});

describe("AudioPayload", () => {
  it("should have required fields", () => {
    const payload: AudioPayload = {
      sessionId: "session-1",
      ts: Date.now(),
      frame: "base64encodedaudio==",
    };

    expect(payload.sessionId).toBe("session-1");
    expect(payload.frame).toBe("base64encodedaudio==");
    expect(typeof payload.ts).toBe("number");
  });

  it("should allow optional source field", () => {
    const payload: AudioPayload = {
      sessionId: "session-1",
      ts: Date.now(),
      frame: "base64data==",
      source: "system",
    };

    expect(payload.source).toBe("system");
  });

  it("should accept source as undefined", () => {
    const payload: AudioPayload = {
      sessionId: "session-1",
      ts: Date.now(),
      frame: "base64data==",
    };

    expect(payload.source).toBeUndefined();
  });
});
