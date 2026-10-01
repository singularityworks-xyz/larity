import { describe, expect, test } from "bun:test";
import { Tier2SemanticCache } from "./tier2-cache";
import type { Tier2Classification } from "./types";

function makeClassification(intent: Tier2Classification["intent"]) {
  return {
    commitmentType: null,
    confidence: 0.9,
    extractedData: {},
    intent,
    riskSignals: [],
    tone: "neutral",
  } as Tier2Classification;
}

describe("Tier2SemanticCache", () => {
  test("exact text hits regardless of embedding", () => {
    const cache = new Tier2SemanticCache();
    cache.set(
      "s",
      [0.1, 0.2, 0.3],
      "Hello World",
      makeClassification("concern")
    );
    // Different spacing/case normalizes to the same key.
    expect(cache.get("s", [0.9, 0.9, 0.9], "  hello   WORLD ")?.intent).toBe(
      "concern"
    );
  });

  test("near-identical vectors hit on cosine similarity", () => {
    const cache = new Tier2SemanticCache();
    cache.set("s", [1, 0, 0], "something said", makeClassification("question"));
    expect(
      cache.get("s", [0.99, 0.01, 0], "totally different words")?.intent
    ).toBe("question");
    expect(
      cache.get("s", [0, 1, 0], "more different words")?.intent
    ).toBeUndefined();
  });

  test("updating existing text replaces the classification", () => {
    const cache = new Tier2SemanticCache();
    cache.set("s", [1, 0, 0], "same words", makeClassification("general"));
    cache.set("s", [1, 0, 0], "same words", makeClassification("decision"));
    expect(cache.get("s", [0, 0, 1], "same words")?.intent).toBe("decision");
  });

  test("eviction drops the least-recently-used entry", () => {
    const cache = new Tier2SemanticCache();
    const firstEmbedding = [1, 0, 0];
    const fillerEmbedding = [0, 1, 0];
    cache.set(
      "s",
      firstEmbedding,
      "first entry here",
      makeClassification("general")
    );
    cache.set(
      "s",
      fillerEmbedding,
      "filler entry number 1",
      makeClassification("filler")
    );
    cache.set(
      "s",
      fillerEmbedding,
      "filler entry number 2",
      makeClassification("filler")
    );
    // Touch the first entry so it becomes most-recently-used.
    cache.get("s", firstEmbedding, "first entry here");
    // Fill to the 200 cap and overflow by one: evicts filler #1, not first.
    for (let i = 3; i <= 200; i++) {
      cache.set(
        "s",
        fillerEmbedding,
        `filler entry number ${i}`,
        makeClassification("filler")
      );
    }
    // Query embedding is far from every surviving vector, so only an exact
    // text hit could match — and filler #1's exact entry is gone.
    expect(
      cache.get("s", [0.5, 0.5, 0], "filler entry number 1")
    ).toBeUndefined();
    expect(cache.get("s", firstEmbedding, "first entry here")?.intent).toBe(
      "general"
    );
  });

  test("sessions are isolated and closeable", () => {
    const cache = new Tier2SemanticCache();
    cache.set("a", [1, 0, 0], "shared words", makeClassification("general"));
    expect(cache.get("b", [1, 0, 0], "shared words")).toBeUndefined();
    cache.closeSession("a");
    expect(cache.get("a", [1, 0, 0], "shared words")).toBeUndefined();
  });
});
