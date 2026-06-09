import { createWorkerLogger } from "../logger";
import { generateEmbedding } from "./embeddings";

const log = createWorkerLogger("deduplication");

/**
 * Computes the cosine similarity between two numeric vectors.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have the same length");
  }
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface DeduplicatableItem {
  textToEmbed: string;
}

/**
 * Deduplicates an array of items based on cosine similarity of their embeddings.
 * Keeps the first item encountered when a duplicate is found.
 */
export async function deduplicateItems<T extends DeduplicatableItem>(
  items: T[],
  threshold = 0.95
): Promise<T[]> {
  if (items.length <= 1) {
    return items;
  }

  // Generate embeddings for all items
  const itemsWithEmbeddings = await Promise.all(
    items.map(async (item) => {
      try {
        const embedding = await generateEmbedding(item.textToEmbed);
        return { item, embedding };
      } catch (error) {
        log.warn(
          { err: error },
          "Failed to generate embedding; item kept without deduplication"
        );
        // Return null embedding on failure, which will prevent similarity matches
        return { item, embedding: null as number[] | null };
      }
    })
  );

  const uniqueItems: typeof itemsWithEmbeddings = [];

  for (const current of itemsWithEmbeddings) {
    if (!current.embedding) {
      uniqueItems.push(current);
      continue;
    }

    let isDuplicate = false;
    for (const unique of uniqueItems) {
      if (!unique.embedding) {
        continue;
      }
      const similarity = cosineSimilarity(current.embedding, unique.embedding);
      if (similarity >= threshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      uniqueItems.push(current);
    }
  }

  return uniqueItems.map((u) => u.item);
}
