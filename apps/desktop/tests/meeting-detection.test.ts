import { describe, expect, it } from "bun:test";
import {
  findCalendarPrompt,
  formatMeetingCountdown,
  getMockCalendarMeetings,
} from "../src/services/meeting-detection";

describe("meeting detection calendar prompts", () => {
  it("returns the earliest meeting inside lookahead window", () => {
    const nowMs = Date.now();
    const meetings = [
      { id: "b", title: "Later", startTimeMs: nowMs + 4 * 60_000 },
      { id: "a", title: "Sooner", startTimeMs: nowMs + 2 * 60_000 },
      { id: "c", title: "Outside", startTimeMs: nowMs + 9 * 60_000 },
    ];

    const prompt = findCalendarPrompt({
      meetings,
      nowMs,
      lookaheadMs: 5 * 60_000,
      promptedMeetingIds: new Set(),
    });

    expect(prompt?.id).toBe("a");
    expect(prompt?.source).toBe("calendar");
  });

  it("ignores meetings already prompted", () => {
    const nowMs = Date.now();
    const meetings = [
      { id: "a", title: "Already Prompted", startTimeMs: nowMs + 2 * 60_000 },
      { id: "b", title: "Next", startTimeMs: nowMs + 4 * 60_000 },
    ];

    const prompt = findCalendarPrompt({
      meetings,
      nowMs,
      lookaheadMs: 5 * 60_000,
      promptedMeetingIds: new Set(["a"]),
    });

    expect(prompt?.id).toBe("b");
  });

  it("formats meeting countdown text", () => {
    const nowMs = Date.now();
    expect(formatMeetingCountdown(nowMs + 20_000, nowMs)).toBe(
      "starts in under a minute"
    );
    expect(formatMeetingCountdown(nowMs + 2 * 60_000, nowMs)).toBe(
      "starts in 2 min"
    );
  });

  it("creates deterministic mock meetings", () => {
    const nowMs = 1_700_000_000_000;
    const meetings = getMockCalendarMeetings(nowMs);

    expect(meetings).toHaveLength(2);
    expect(meetings[0]?.startTimeMs).toBe(nowMs + 3 * 60_000);
  });
});
