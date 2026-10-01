import { describe, expect, test } from "bun:test";
import {
  isFinalSttChannel,
  isPartialSttChannel,
  STT_FINAL_PATTERN,
  STT_LEGACY_PATTERN,
  STT_PARTIAL_PATTERN,
} from "./channels";
import { resolveSttDispatch } from "./subscriber";

describe("STT channel shapes", () => {
  test("patterns are disjoint: partials never look like finals", () => {
    expect(isPartialSttChannel("meeting.stt.partial.s1")).toBe(true);
    expect(isFinalSttChannel("meeting.stt.partial.s1")).toBe(false);
    expect(isFinalSttChannel("meeting.stt.final.s1")).toBe(true);
    expect(isPartialSttChannel("meeting.stt.final.s1")).toBe(false);
  });

  test("empty session segments are rejected", () => {
    expect(isFinalSttChannel("meeting.stt.final.")).toBe(false);
    expect(isPartialSttChannel("meeting.stt.partial.")).toBe(false);
    expect(isFinalSttChannel("meeting.stt.final")).toBe(false);
  });

  test("legacy finals still classify as finals", () => {
    expect(isFinalSttChannel("meeting.stt.s1")).toBe(true);
    expect(isPartialSttChannel("meeting.stt.s1")).toBe(false);
  });
});

describe("resolveSttDispatch", () => {
  test("exactly one pattern delivery resolves per partial message", () => {
    const channel = "meeting.stt.partial.s1";
    const viaFinal = resolveSttDispatch(STT_FINAL_PATTERN, channel);
    const viaPartial = resolveSttDispatch(STT_PARTIAL_PATTERN, channel);
    // The old `meeting.stt.*` final pattern also matched partial channels,
    // causing double processing. Now only the partial delivery resolves.
    expect(viaFinal).toBeNull();
    expect(viaPartial).toBe("partial");
  });

  test("exactly one pattern delivery resolves per final message", () => {
    const channel = "meeting.stt.final.s1";
    expect(resolveSttDispatch(STT_FINAL_PATTERN, channel)).toBe("final");
    expect(resolveSttDispatch(STT_PARTIAL_PATTERN, channel)).toBeNull();
  });

  test("legacy final resolves via the legacy pattern only", () => {
    const channel = "meeting.stt.s1";
    expect(resolveSttDispatch(STT_LEGACY_PATTERN, channel)).toBe("final");
    expect(resolveSttDispatch(STT_FINAL_PATTERN, channel)).toBe("final");
    expect(resolveSttDispatch(STT_PARTIAL_PATTERN, channel)).toBeNull();
  });

  test("new-shape finals are not double-handled by the legacy pattern", () => {
    const channel = "meeting.stt.final.s1";
    expect(resolveSttDispatch(STT_LEGACY_PATTERN, channel)).toBeNull();
    expect(resolveSttDispatch(STT_FINAL_PATTERN, channel)).toBe("final");
  });

  test("unrelated patterns and channels resolve to null", () => {
    expect(
      resolveSttDispatch("meeting.utterance.*", "meeting.stt.final.s1")
    ).toBeNull();
    expect(
      resolveSttDispatch(STT_FINAL_PATTERN, "meeting.utterance.s1")
    ).toBeNull();
    expect(
      resolveSttDispatch(STT_PARTIAL_PATTERN, "realtime.vad.s1")
    ).toBeNull();
  });
});
