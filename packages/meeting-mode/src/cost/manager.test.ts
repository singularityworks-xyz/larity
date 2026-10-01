import { describe, expect, test } from "bun:test";
import {
  CostManager,
  hasPricingForModel,
  SPECULATIVE_COST_TRACK,
} from "./manager";

describe("CostManager model pricing", () => {
  test("known models resolve (exact and provider-prefixed)", () => {
    expect(hasPricingForModel("gpt-oss-120b")).toBe(true);
    expect(hasPricingForModel("openai/gpt-oss-120b")).toBe(true);
    expect(hasPricingForModel("gemini-3.1-flash-lite")).toBe(true);
    expect(hasPricingForModel("no-such-model")).toBe(false);
  });

  test("Tier 2 default model bills at General Compute gpt-oss rates", async () => {
    const manager = new CostManager();
    const total = await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b");
    // 1M input tokens × $0.21/M = 0.21 (flash-lite fallback would be 0.25).
    expect(total).toBeCloseTo(0.21, 10);
  });

  test("prefixed alias bills identically", async () => {
    const manager = new CostManager();
    const total = await manager.recordCost(
      "s1",
      1_000_000,
      0,
      "openai/gpt-oss-120b"
    );
    expect(total).toBeCloseTo(0.21, 10);
  });

  test("gemini-2.5-flash has a pricing entry (fallback provider)", () => {
    expect(hasPricingForModel("gemini-2.5-flash")).toBe(true);
  });

  test("gemini-3.5-flash-lite has a pricing entry (Tier 4 default)", () => {
    expect(hasPricingForModel("gemini-3.5-flash-lite")).toBe(true);
    const manager = new CostManager();
    return manager
      .recordCost("s1", 1_000_000, 1_000_000, "gemini-3.5-flash-lite")
      .then((total) => {
        // $0.30 input + $2.50 output per 1M tokens.
        expect(total).toBeCloseTo(2.8, 10);
      });
  });
});

describe("CostManager tracked costs (P3.3)", () => {
  test("trackAs accumulates under its own track and the session total", async () => {
    const manager = new CostManager();
    const total = await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b", {
      trackAs: SPECULATIVE_COST_TRACK,
    });
    expect(total).toBeCloseTo(0.21, 10);
    expect(
      await manager.getTrackedCost("s1", SPECULATIVE_COST_TRACK)
    ).toBeCloseTo(0.21, 10);
    // Session total includes the tracked spend (budget accuracy).
    expect(await manager.getSessionCost("s1")).toBeCloseTo(0.21, 10);
  });

  test("untracked records leave tracks at zero", async () => {
    const manager = new CostManager();
    await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b");
    expect(await manager.getTrackedCost("s1", SPECULATIVE_COST_TRACK)).toBe(0);
  });

  test("tracked spend accumulates across records", async () => {
    const manager = new CostManager();
    await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b", {
      trackAs: SPECULATIVE_COST_TRACK,
    });
    await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b", {
      trackAs: SPECULATIVE_COST_TRACK,
    });
    expect(
      await manager.getTrackedCost("s1", SPECULATIVE_COST_TRACK)
    ).toBeCloseTo(0.42, 10);
  });

  test("zero-token records create no tracked entry", async () => {
    const manager = new CostManager();
    await manager.recordCost("s1", 0, 0, "gpt-oss-120b", {
      trackAs: SPECULATIVE_COST_TRACK,
    });
    expect(await manager.getTrackedCost("s1", SPECULATIVE_COST_TRACK)).toBe(0);
  });

  test("closeSession clears tracked buckets", async () => {
    const manager = new CostManager();
    await manager.recordCost("s1", 1_000_000, 0, "gpt-oss-120b", {
      trackAs: SPECULATIVE_COST_TRACK,
    });
    await manager.closeSession("s1");
    expect(await manager.getTrackedCost("s1", SPECULATIVE_COST_TRACK)).toBe(0);
    expect(await manager.getSessionCost("s1")).toBe(0);
  });
});
