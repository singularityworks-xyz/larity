import { describe, expect, it } from "bun:test";
import { cosineSimilarity, updateCentroid } from "../../src/topic/similarity";

describe("Topic Similarity Math", () => {
  describe("cosineSimilarity", () => {
    it("should return 1 for identical vectors", () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1, 5);
    });

    it("should return 0 for orthogonal vectors", () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it("should return -1 for opposite vectors", () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1, 5);
    });

    it("should handle zero vectors gracefully", () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it("should throw if vectors have different lengths", () => {
      expect(() => cosineSimilarity([1], [1, 2])).toThrow("same length");
    });
  });

  describe("updateCentroid", () => {
    it("should correctly update the centroid with a new vector", () => {
      // Centroid of 1 vector [2, 2] is just [2, 2]
      const current = [2, 2];
      const next = [4, 4];
      const count = 1;

      // Expected: ((2*1 + 4)/2, (2*1 + 4)/2) = [3, 3]
      const updated = updateCentroid(current, next, count);
      expect(updated[0]).toBe(3);
      expect(updated[1]).toBe(3);
    });

    it("should heavily weight old centroids if count is high", () => {
      const current = [1, 1];
      const next = [10, 10];
      const count = 8; // 8 previous utterances

      // Expected: ((1*8 + 10)/9, (1*8 + 10)/9) = [2, 2]
      const updated = updateCentroid(current, next, count);
      expect(updated[0]).toBe(2);
      expect(updated[1]).toBe(2);
    });

    it("should throw if vectors have different lengths", () => {
      expect(() => updateCentroid([1], [1, 2], 1)).toThrow("same length");
    });
  });
});
