export function packEmbeddingToBase64(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error("Cannot encode empty embedding");
  }

  const floatArray = new Float32Array(embedding);
  return Buffer.from(floatArray.buffer).toString("base64");
}

export function unpackEmbeddingFromBase64(payload: string): number[] {
  if (!payload) {
    throw new Error("Missing embedding payload");
  }

  const binary = Buffer.from(payload, "base64");
  if (binary.byteLength === 0) {
    throw new Error("Decoded embedding payload is empty");
  }

  if (binary.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error("Invalid embedding payload length");
  }

  const arrayBuffer = binary.buffer.slice(
    binary.byteOffset,
    binary.byteOffset + binary.byteLength
  );

  return Array.from(new Float32Array(arrayBuffer));
}
