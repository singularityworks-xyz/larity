import { describe, expect, test } from "bun:test";
import { ClockOffsetTracker } from "./clock-offset";

describe("ClockOffsetTracker measured half-RTT", () => {
  test("typical RTT splits evenly", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 1100);
    expect(tracker.getMedianOffset("u1")).toBe(50);
  });

  test("large RTT clamps the one-way estimate at 500 ms", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 3000);
    expect(tracker.getMedianOffset("u1")).toBe(1500);
  });

  test("negative transit (skewed clocks) clamps at zero", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1100, 1000);
    expect(tracker.getMedianOffset("u1")).toBe(-100);
  });

  test("median smooths jitter across samples", () => {
    const tracker = new ClockOffsetTracker();
    tracker.addSample("u1", 1000, 1100);
    tracker.addSample("u1", 1000, 1200);
    tracker.addSample("u1", 1000, 1300);
    expect(tracker.getMedianOffset("u1")).toBe(100);
  });

  test("unknown users report zero offset", () => {
    const tracker = new ClockOffsetTracker();
    expect(tracker.getMedianOffset("nobody")).toBe(0);
    expect(tracker.isUntrusted()).toBe(false);
  });
});
