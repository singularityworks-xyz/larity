import { describe, expect, test } from "bun:test";
import { ClockOffsetTracker } from "./clock-offset";

describe("ClockOffsetTracker measured half-RTT", () => {
  test("typical RTT splits evenly", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 1100);
    // offset = 100 - 50 = 50
    expect(tracker.getMedianOffset("u1")).toBe(50);
  });

  test("large RTT clamps the one-way estimate at 500 ms", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 3000);
    // halfRTT = min(2000/2, 500) = 500 → offset = 2000 - 500 = 1500
    // (hard-coded 50 ms would give 1950)
    expect(tracker.getMedianOffset("u1")).toBe(1500);
  });

  test("negative transit (skewed clocks) clamps at zero", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1100, 1000);
    // halfRTT = max(0, -50) = 0 → offset = -100
    // (hard-coded 50 ms would give -150)
    expect(tracker.getMedianOffset("u1")).toBe(-100);
  });

  test("median smooths jitter across samples", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 1100); // 50
    tracker.addSample("u1", 1000, 1200); // 100
    tracker.addSample("u1", 1000, 1300); // 150
    expect(tracker.getMedianOffset("u1")).toBe(100);
  });

  test("unknown users report zero offset", () => {
    const tracker = new ClockOffsetTracker();
    expect(tracker.getMedianOffset("nobody")).toBe(0);
    expect(tracker.isUntrusted()).toBe(false);
  });
});
