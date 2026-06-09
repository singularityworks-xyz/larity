import { describe, expect, it } from "bun:test";
import { computeTalkTime } from "../src/lib/talk-time";

describe("Talk-Time Stats Calculation", () => {
  it("should return empty object for empty utterances", () => {
    expect(computeTalkTime([])).toEqual({});
  });

  it("should calculate correct counts, total seconds, and percentages for multiple speakers", () => {
    const utterances = [
      { speaker: "Aman", duration: 10 },
      { speaker: "Aman", duration: 20 },
      { speaker: "Richard Sterling", duration: 30 },
      { speaker: "Aman", duration: 10 },
      { speaker: "Richard Sterling", duration: 10 },
    ];

    const stats = computeTalkTime(utterances);

    expect(stats.Aman).toBeDefined();
    expect(stats.Aman.utteranceCount).toBe(3);
    expect(stats.Aman.totalSeconds).toBe(40);
    expect(stats.Aman.talkTimePercent).toBe(50); // 40 / 80 * 100

    expect(stats["Richard Sterling"]).toBeDefined();
    expect(stats["Richard Sterling"].utteranceCount).toBe(2);
    expect(stats["Richard Sterling"].totalSeconds).toBe(40);
    expect(stats["Richard Sterling"].talkTimePercent).toBe(50); // 40 / 80 * 100
  });

  it("should handle single speaker correct stats", () => {
    const utterances = [{ speaker: "Aman", duration: 12.5 }];

    const stats = computeTalkTime(utterances);

    expect(stats.Aman).toBeDefined();
    expect(stats.Aman.utteranceCount).toBe(1);
    expect(stats.Aman.totalSeconds).toBe(12.5);
    expect(stats.Aman.talkTimePercent).toBe(100);
  });

  it("should handle division by zero safely if total seconds is 0", () => {
    const utterances = [
      { speaker: "Aman", duration: 0 },
      { speaker: "Richard Sterling", duration: 0 },
    ];

    const stats = computeTalkTime(utterances);

    expect(stats.Aman.talkTimePercent).toBe(0);
    expect(stats["Richard Sterling"].talkTimePercent).toBe(0);
  });

  it("should handle floating-point precision without accumulation errors", () => {
    const utterances = [
      { speaker: "Speaker A", duration: 0.1 },
      { speaker: "Speaker A", duration: 0.1 },
      { speaker: "Speaker A", duration: 0.1 },
      { speaker: "Speaker B", duration: 0.2 },
      { speaker: "Speaker B", duration: 0.2 },
      { speaker: "Speaker B", duration: 0.2 },
    ];

    const stats = computeTalkTime(utterances);

    expect(stats["Speaker A"].totalSeconds).toBe(0.3);
    expect(stats["Speaker A"].talkTimePercent).toBe(33.3);

    expect(stats["Speaker B"].totalSeconds).toBe(0.6);
    expect(stats["Speaker B"].talkTimePercent).toBe(66.7);
  });
});
