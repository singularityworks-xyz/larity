export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i] as number;
    const valB = b[i] as number;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculates the new centroid of a cluster using a rolling average formula.
 *
 * @param oldCentroid The current centroid vector of the topic
 * @param newVector The embedding of the new utterance
 * @param oldCount The number of utterances already in the topic (BEFORE adding the new one)
 * @returns The updated centroid vector
 */
export function updateCentroid(
  oldCentroid: number[],
  newVector: number[],
  oldCount: number
): number[] {
  if (oldCentroid.length !== newVector.length) {
    throw new Error("Vectors must have the same length");
  }

  const updated = new Array<number>(oldCentroid.length);
  const newTotal = oldCount + 1;

  for (let i = 0; i < oldCentroid.length; i++) {
    // Formula: C_new = (C_old * N + V_new) / (N + 1)
    const oldVal = oldCentroid[i] as number;
    const newVal = newVector[i] as number;
    updated[i] = (oldVal * oldCount + newVal) / newTotal;
  }

  return updated;
}
