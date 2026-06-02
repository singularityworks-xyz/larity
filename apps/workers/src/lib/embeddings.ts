import { ai } from "./gemini";

const EMBEDDING_MODEL = "gemini-embedding-2-preview";
const EMBEDDING_DIMENSIONALITY = 768;

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: {
        outputDimensionality: EMBEDDING_DIMENSIONALITY,
      },
    });

    if (
      !response.embeddings ||
      response.embeddings.length === 0 ||
      !response.embeddings[0]?.values
    ) {
      throw new Error("Empty embedding returned from Gemini API");
    }

    return response.embeddings[0].values as number[];
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    throw error;
  }
}
