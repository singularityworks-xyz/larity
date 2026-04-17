import { describe, expect, it } from "bun:test";
import { ClockOffsetTracker } from "../../src/speaker/clock-offset";

describe("ClockOffsetTracker", () => {
  const userId = "test-user";

  it("should calculate the median offset correctly, ignoring outliers", () => {
    const tracker = new ClockOffsetTracker();
    // Insert 5 samples with ~100ms offset, and 1 massive outlier
    tracker.addSample(userId, 1000, 1150); // offset: 150 - 50(RTT) = 100
    tracker.addSample(userId, 1050, 1200); // offset: 100
    tracker.addSample(userId, 1100, 1250); // offset: 100
    tracker.addSample(userId, 1150, 1300); // offset: 100
    tracker.addSample(userId, 1200, 2050); // outlier offset: 800

    // Median should still be 100
    expect(tracker.getMedianOffset(userId)).toBe(100);
  });

  it("should detect >500ms shifts and mark as untrusted temporarily", () => {
    const tracker = new ClockOffsetTracker();
    // Stable baseline
    for (let i = 0; i < 10; i++) {
      tracker.addSample(userId, 1000 + i * 10, 1150 + i * 10);
    }
    expect(tracker.isUntrusted()).toBe(false);

    // Sudden shift (e.g. laptop wakes from sleep 5 seconds later)
    for (let i = 0; i < 15; i++) {
      tracker.addSample(userId, 2000 + i * 10, 7050 + i * 10); // 5000ms offset
    }

    expect(tracker.isUntrusted()).toBe(true);
    // Fast forward 2 seconds
    tracker.fastForwardTime(Date.now() + 2100); // Mock time advancement
    expect(tracker.isUntrusted()).toBe(false); // Should clear after 2s
  });
});
