import { GoogleGenAI } from "@google/genai";
import { GEMINI_API_KEY } from "../env";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("topic-embedder");

/**
 * Embedding request budget (P2.2). The finalizer publishes before topic
 * assignment, so a hung embedding must fail fast rather than stall the
 * per-session finalize chain.
 */
const EMBEDDING_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Embedding timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

export class GoogleGenAIEmbedder {
  private readonly ai: GoogleGenAI;
  private readonly model = "gemini-embedding-2-preview";
  private readonly outputDimensionality = 768;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async embed(
    text: string,
    timeoutMs = EMBEDDING_TIMEOUT_MS
  ): Promise<number[]> {
    try {
      const response = await withTimeout(
        this.ai.models.embedContent({
          model: this.model,
          contents: text,
          config: {
            outputDimensionality: this.outputDimensionality,
          },
        }),
        timeoutMs
      );

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
