import { describe, expect, test } from "bun:test";
import { parseSttEnvelope } from "./subscriber";

describe("parseSttEnvelope", () => {
  test("parses new final channels", () => {
    expect(parseSttEnvelope("meeting.stt.final.s1")).toEqual({
      sessionId: "s1",
      type: "stt_final",
    });
  });

  test("parses partial channels", () => {
    expect(parseSttEnvelope("meeting.stt.partial.s1")).toEqual({
      sessionId: "s1",
      type: "stt_partial",
    });
  });

  test("parses legacy final channels", () => {
    expect(parseSttEnvelope("meeting.stt.s1")).toEqual({
      sessionId: "s1",
      type: "stt_final",
    });
  });

  test("rejects non-STT and malformed channels", () => {
    expect(parseSttEnvelope("meeting.utterance.s1")).toBeNull();
    expect(parseSttEnvelope("meeting.stt.")).toBeNull();
    expect(parseSttEnvelope("meeting.stt.partial.")).toBeNull();
    expect(parseSttEnvelope("meeting.stt.final.")).toBeNull();
    expect(parseSttEnvelope("meeting.stt.final")).toBeNull();
    expect(parseSttEnvelope("meeting.stt.partial")).toBeNull();
    expect(parseSttEnvelope("other.stt.final.s1")).toBeNull();
  });
});
