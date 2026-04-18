import { describe, expect, it } from "bun:test";
import { BruteForceCommitmentVectorIndex } from "../../src/commitment/vector-index";

describe("commitment/vector-index", () => {
  it("returns top similarities in descending order", () => {
    const index = new BruteForceCommitmentVectorIndex();

    index.add(1, [1, 0, 0]);
    index.add(2, [0.8, 0.2, 0]);
    index.add(3, [0, 1, 0]);

    const hits = index.search([1, 0, 0], 2);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.vectorId).toBe(1);
    expect(hits[1]?.vectorId).toBe(2);
    expect((hits[0]?.similarity ?? 0) >= (hits[1]?.similarity ?? 0)).toBe(true);
  });

  it("enforces consistent vector dimensions", () => {
    const index = new BruteForceCommitmentVectorIndex();
    index.add(1, [1, 2, 3]);

    expect(() => index.add(2, [1, 2])).toThrow(
      "Embedding dimension mismatch: expected 3, got 2"
    );
    expect(() => index.search([1, 2], 1)).toThrow(
      "Query embedding dimension mismatch: expected 3, got 2"
    );
  });

  it("returns empty results for empty index or non-positive limit", () => {
    const index = new BruteForceCommitmentVectorIndex();
    expect(index.search([1, 2, 3], 5)).toEqual([]);

    index.add(1, [1, 2, 3]);
    expect(index.search([1, 2, 3], 0)).toEqual([]);
  });

  it("clears all vectors", () => {
    const index = new BruteForceCommitmentVectorIndex();
    index.add(1, [1, 0]);
    index.add(2, [0, 1]);
    expect(index.size()).toBe(2);

    index.clear();
    expect(index.size()).toBe(0);
    expect(index.search([1, 0], 2)).toEqual([]);
  });
});
