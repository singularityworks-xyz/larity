import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "../env";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("topic-embedder");

export class GoogleGenAIEmbedder {
  private readonly ai: GoogleGenAI;
  private readonly model = "gemini-embedding-2-preview";
  private readonly outputDimensionality = 768;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.ai.models.embedContent({
        model: this.model,
        contents: text,
        config: {
          outputDimensionality: this.outputDimensionality,
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
      log.error(
        { err: error, textPrefix: text.slice(0, 50) },
        "Failed to embed text"
      );
      throw error;
    }
  }
}
