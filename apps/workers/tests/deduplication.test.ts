import { describe, expect, it, mock } from "bun:test";
import { cosineSimilarity } from "../src/lib/deduplication";

// Mock the embeddings library
const mockGenerateEmbedding = mock();
mock.module("../src/lib/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

describe("Deduplication & Cosine Similarity", () => {
  describe("cosineSimilarity", () => {
    it("should compute similarity correctly for identical vectors", () => {
      const vec = [1, 2, 3];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 5);
    });

    it("should compute similarity correctly for orthogonal vectors", () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it("should compute similarity correctly for opposite vectors", () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1.0, 5);
    });

    it("should compute similarity correctly for typical vectors", () => {
      const vecA = [3, 4, 0]; // norm = 5
      const vecB = [4, 3, 0]; // norm = 5
      // dot product = 3*4 + 4*3 = 24
      // cosine similarity = 24 / 25 = 0.96
      expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(0.96, 5);
    });

    it("should throw error if lengths do not match", () => {
      expect(() => cosineSimilarity([1], [1, 2])).toThrow(
        "Vectors must have the same length"
      );
    });
  });

  describe("deduplicateItems", () => {
    it("should deduplicate items with similarity greater than threshold", async () => {
      const { deduplicateItems } = await import("../src/lib/deduplication");

      // Clear previous mocks
      mockGenerateEmbedding.mockClear();

      // Mock embeddings returning similar vectors
      // Item 1: Decision A
      // Item 2: Decision B (Duplicate of A)
      // Item 3: Decision C (Unique)
      mockGenerateEmbedding
        .mockImplementationOnce(() => Promise.resolve([1, 0, 0])) // A
        .mockImplementationOnce(() => Promise.resolve([0.98, 0, 0])) // B (similarity 0.98 >= 0.95)
        .mockImplementationOnce(() => Promise.resolve([0, 1, 0])); // C (similarity 0)

      const items = [
        { title: "Decision A", textToEmbed: "We will adopt typescript" },
        {
          title: "Decision B",
          textToEmbed: "Adopt typescript as our primary language",
        },
        { title: "Decision C", textToEmbed: "Setup postgres database" },
      ];

      const result = await deduplicateItems(items, 0.95);

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe("Decision A");
      expect(result[1].title).toBe("Decision C");
    });

    it("should return same array if 1 or 0 items are provided", async () => {
      const { deduplicateItems } = await import("../src/lib/deduplication");

      const empty = await deduplicateItems([]);
      expect(empty).toHaveLength(0);

      const single = await deduplicateItems([{ textToEmbed: "one" }]);
      expect(single).toHaveLength(1);
    });
  });
});
