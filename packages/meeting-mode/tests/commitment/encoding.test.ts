import { describe, expect, it } from "bun:test";
import {
  packEmbeddingToBase64,
  unpackEmbeddingFromBase64,
} from "../../src/commitment/encoding";

describe("commitment/encoding", () => {
  it("packs and unpacks embeddings with bounded precision loss", () => {
    const embedding = [0.1, -0.25, 1.5, 42.125, 0.0001];

    const encoded = packEmbeddingToBase64(embedding);
    const decoded = unpackEmbeddingFromBase64(encoded);

    expect(decoded).toHaveLength(embedding.length);

    for (const [index, value] of embedding.entries()) {
      expect(decoded[index]).toBeCloseTo(value, 5);
    }
  });

  it("throws for empty embeddings", () => {
    expect(() => packEmbeddingToBase64([])).toThrow(
      "Cannot encode empty embedding"
    );
  });

  it("throws for malformed payloads", () => {
    expect(() => unpackEmbeddingFromBase64("")).toThrow(
      "Missing embedding payload"
    );

    const invalidLengthPayload = Buffer.from([0, 1, 2]).toString("base64");
    expect(() => unpackEmbeddingFromBase64(invalidLengthPayload)).toThrow(
      "Invalid embedding payload length"
    );
  });
});
