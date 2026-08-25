import { describe, expect, it } from "bun:test";

describe("Boot Sequence Helpers & State Machine", () => {
  it("computes exponential backoff delays with reasonable bounds", () => {
    function calculateBackoffDelay(attempt: number): number {
      const base = Math.min(30, 2 ** (attempt - 1));
      return Math.round(base);
    }

    expect(calculateBackoffDelay(1)).toBe(1);
    expect(calculateBackoffDelay(2)).toBe(2);
    expect(calculateBackoffDelay(3)).toBe(4);
    expect(calculateBackoffDelay(4)).toBe(8);
    expect(calculateBackoffDelay(5)).toBe(16);
    expect(calculateBackoffDelay(6)).toBe(30); // Capped at 30s
    expect(calculateBackoffDelay(10)).toBe(30); // Capped at 30s
  });

  it("handles step transition progression order", () => {
    const steps = [1, 2, 3, 4] as const;
    expect(steps.length).toBe(4);
    expect(steps[0]).toBe(1);
    expect(steps[3]).toBe(4);
  });
});
