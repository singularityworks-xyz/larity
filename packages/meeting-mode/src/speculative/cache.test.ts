import { describe, expect, test } from "bun:test";
import type { Tier1Result, Tier2Classification } from "../pipeline/types";
import { SpeculativeCache } from "./cache";
import type { SpeculativeResult } from "./types";

function makeTier1(): Tier1Result {
  return {
    blocklistHit: false,
    detections: [],
    pricingHit: false,
    technicalHit: false,
  };
}

function makeClassification(): Tier2Classification {
  return {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    extractedData: {},
    confidence: 0.9,
  };
}

function makeResult(
  partialText: string,
  classification: Tier2Classification = makeClassification()
): SpeculativeResult {
  return {
    classification,
    createdAt: Date.now(),
    partialText,
    predictedTopicId: undefined,
    tier1Result: makeTier1(),
  };
}

describe("SpeculativeCache speaker+trigram index (P3.4)", () => {
  test("matching partial hits through the speaker bucket", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("we can deliver by"));
    // Same first 3 words → same bucket; extension keeps mismatch low.
    const match = cache.match("s1", "we can deliver by fri", "spk_a");
    expect(match.matched).toBe(true);
    expect(match.result?.partialText).toBe("we can deliver by");
  });

  test("different speaker does not match via trigram bucket", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("we can deliver by"));
    // spk_b has nothing cached — bucket + speaker lookup both empty →
    // no fallback to another speaker's entries.
    const match = cache.match("s1", "we can deliver by fri", "spk_b");
    expect(match.matched).toBe(false);
    expect(match.mismatchRatio).toBe(1);
  });

  test("same speaker, divergent opening falls back to speaker scan", () => {
    const cache = new SpeculativeCache();
    // Partial opens with "we can deliver"; the final reorders to
    // "can we deliver" → different bucket, same remainder.
    cache.set("s1", "spk_a", makeResult("we can deliver therelease"));
    const match = cache.match("s1", "can we deliver therelease", "spk_a");
    expect(match.matched).toBe(true);
  });

  test("speaker omitted preserves legacy whole-session scan", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("we can deliver by"));
    const match = cache.match("s1", "we can deliver by fri");
    expect(match.matched).toBe(true);
  });

  test("punctuation/case normalization shapes the bucket", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("We can, deliver by!"));
    const match = cache.match("s1", "we can deliver by fri", "spk_a");
    expect(match.matched).toBe(true);
  });

  test("trigram-prefix growth stays in the same bucket", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("we can deliver by"));
    const match = cache.match("s1", "we can deliver by fri", "spk_a");
    expect(match.matched).toBe(true);
  });

  test("short entries still match when text is essentially unchanged", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("ship it"));
    const match = cache.match("s1", "ship it", "spk_a");
    expect(match.matched).toBe(true);
    expect(match.mismatchRatio).toBe(0);
  });

  test("evicted entries disappear from buckets (bounded memory)", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("zzz unique evicted phrase"));
    // Fill past capacity so the first entry is evicted.
    for (let i = 0; i < 100; i++) {
      cache.set("s1", "spk_a", makeResult(`filler sentence number ${i}`));
    }
    const match = cache.match("s1", "zzz unique evicted phrase here", "spk_a");
    expect(match.matched).toBe(false);
  });

  test("TTL-expired entries are dropped during match", () => {
    const cache = new SpeculativeCache();
    const stale: SpeculativeResult = {
      ...makeResult("we can deliver by"),
      createdAt: Date.now() - 60_000,
    };
    cache.set("s1", "spk_a", stale);
    const match = cache.match("s1", "we can deliver by fri", "spk_a");
    expect(match.matched).toBe(false);
  });

  test("structural dedup still collapses identical classifications", () => {
    const cache = new SpeculativeCache();
    const classification = makeClassification();
    cache.set("s1", "spk_a", makeResult("text one here", classification));
    cache.set("s1", "spk_a", makeResult("text two here", classification));
    // Only the newest entry survives; matching it resolves directly.
    const match = cache.match("s1", "text two here now", "spk_a");
    expect(match.matched).toBe(true);
    expect(match.result?.partialText).toBe("text two here");
  });

  test("closeSession clears buckets", () => {
    const cache = new SpeculativeCache();
    cache.set("s1", "spk_a", makeResult("we can deliver by"));
    cache.closeSession("s1");
    expect(cache.match("s1", "we can deliver by fri", "spk_a").matched).toBe(
      false
    );
  });
});
