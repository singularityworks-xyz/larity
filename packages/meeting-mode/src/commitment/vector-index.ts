import { cosineSimilarity } from "../topic/similarity";

export interface VectorSearchHit {
  similarity: number;
  vectorId: number;
}

export interface CommitmentVectorIndex {
  add(vectorId: number, vector: number[]): void;
  clear(): void;
  search(queryVector: number[], limit: number): VectorSearchHit[];
  size(): number;
}

export class BruteForceCommitmentVectorIndex implements CommitmentVectorIndex {
  private readonly vectors = new Map<number, number[]>();
  private dimensions: number | null = null;

  add(vectorId: number, vector: number[]): void {
    if (vector.length === 0) {
      throw new Error("Commitment embedding cannot be empty");
    }

    if (this.dimensions === null) {
      this.dimensions = vector.length;
    }

    if (this.dimensions !== vector.length) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimensions}, got ${vector.length}`
      );
    }

    this.vectors.set(vectorId, vector);
  }

  search(queryVector: number[], limit: number): VectorSearchHit[] {
    if (limit <= 0) {
      return [];
    }

    if (this.dimensions === null || this.vectors.size === 0) {
      return [];
    }

    if (queryVector.length !== this.dimensions) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.dimensions}, got ${queryVector.length}`
      );
    }

    const hits: VectorSearchHit[] = [];

    for (const [vectorId, candidate] of this.vectors) {
      hits.push({
        vectorId,
        similarity: cosineSimilarity(queryVector, candidate),
      });
    }

    hits.sort((left, right) => right.similarity - left.similarity);
    return hits.slice(0, Math.min(limit, hits.length));
  }

  clear(): void {
    this.vectors.clear();
    this.dimensions = null;
  }

  size(): number {
    return this.vectors.size;
  }
}
