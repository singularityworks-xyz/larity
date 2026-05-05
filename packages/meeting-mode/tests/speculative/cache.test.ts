import { describe, expect, it } from "bun:test";
import { SpeculativeCache } from "../../src/speculative/cache";
import type { SpeculativeResult } from "../../src/speculative/types";

function createResult(partialText: string, age = 0): SpeculativeResult {
  return {
    partialText,
    classification: {
      intent: "general",
      commitmentType: null,
      tone: "neutral",
      riskSignals: [],
      extractedData: {},
      confidence: 0.8,
    },
    tier1Result: {
      detections: [],
      technicalHit: false,
      blocklistHit: false,
    },
    predictedTopicId: undefined,
    createdAt: Date.now() - age,
  };
}

describe("SpeculativeCache", () => {
  it("returns no match for empty cache", () => {
    const cache = new SpeculativeCache();
    const result = cache.match("session-1", "hello world");
    expect(result.matched).toBe(false);
    expect(result.result).toBeNull();
  });

  it("stores and retrieves a speculative result", () => {
    const cache = new SpeculativeCache();
    const specResult = createResult("We can deliver this by Fri");
    cache.set("session-1", "spk_0", specResult);

    const match = cache.match("session-1", "We can deliver this by Friday");
    expect(match.matched).toBe(true);
    expect(match.result).not.toBeNull();
    expect(match.mismatchRatio).toBeLessThan(0.3);
  });

  it("does not match when text differs significantly", () => {
    const cache = new SpeculativeCache();
    const specResult = createResult("The weather is nice today");
    cache.set("session-1", "spk_0", specResult);

    const match = cache.match(
      "session-1",
      "We need to discuss the budget allocation"
    );
    expect(match.matched).toBe(false);
    expect(match.mismatchRatio).toBeGreaterThan(0.3);
  });

  it("returns exact match with zero mismatch for identical text", () => {
    const cache = new SpeculativeCache();
    const text = "We can deliver by March 15th";
    const specResult = createResult(text);
    cache.set("session-1", "spk_0", specResult);

    const match = cache.match("session-1", text);
    expect(match.matched).toBe(true);
    expect(match.mismatchRatio).toBe(0);
  });

  it("finds best match among multiple candidates", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("The budget is tight"));
    cache.set("session-1", "spk_0", createResult("We can deliver by Friday"));
    cache.set("session-1", "spk_0", createResult("The timeline is short"));

    const match = cache.match(
      "session-1",
      "We can deliver by Friday afternoon"
    );
    expect(match.matched).toBe(true);
    expect(match.result?.partialText).toBe("We can deliver by Friday");
  });

  it("expires entries older than TTL", () => {
    const cache = new SpeculativeCache();
    const specResult = createResult("old partial text", 15_000);
    cache.set("session-1", "spk_0", specResult);

    const match = cache.match("session-1", "old partial text again");
    expect(match.matched).toBe(false);
  });

  it("respects session isolation", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("same text"));

    const match = cache.match("session-2", "same text");
    expect(match.matched).toBe(false);
  });

  it("evicts oldest entries when max size reached", () => {
    const cache = new SpeculativeCache();
    const longPrefixes = Array.from(
      { length: 105 },
      (_, i) =>
        `session${i} exclusive content about project alpha bravo charlie delta echo foxtrot golf hotel`
    );
    for (let i = 0; i < 105; i++) {
      const prefix = longPrefixes[i];
      cache.set("session-1", "spk_0", createResult(prefix ?? ""));
    }

    const lastPrefix = longPrefixes[104];
    const recentMatch = cache.match("session-1", lastPrefix ?? "");
    expect(recentMatch.matched).toBe(true);
  });

  it("closeSession removes session data", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("hello"));
    cache.closeSession("session-1");

    const match = cache.match("session-1", "hello");
    expect(match.matched).toBe(false);
  });

  it("closeAll clears all sessions", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("hello"));
    cache.set("session-2", "spk_0", createResult("world"));
    cache.closeAll();

    expect(cache.match("session-1", "hello").matched).toBe(false);
    expect(cache.match("session-2", "world").matched).toBe(false);
  });

  it("handles empty final text", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("some text"));

    const match = cache.match("session-1", "");
    expect(match.matched).toBe(false);
  });

  it("matches case-insensitively through normalization", () => {
    const cache = new SpeculativeCache();
    cache.set("session-1", "spk_0", createResult("We Can Deliver By Friday"));

    const match = cache.match("session-1", "we can deliver by friday");
    expect(match.matched).toBe(true);
  });
});
