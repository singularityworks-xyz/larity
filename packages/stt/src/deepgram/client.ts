import { DeepgramClient } from "@deepgram/sdk";
import { DEEPGRAM_API_KEY } from "../env";
import { createSttLogger } from "../logger";

const log = createSttLogger("dg-client");

let client: DeepgramClient | null = null;

/**
 * Get or create the Deepgram client instance
 */
export function getDeepgramClient(): DeepgramClient {
  if (!client) {
    if (!DEEPGRAM_API_KEY) {
      throw new Error("DEEPGRAM_API_KEY is not set");
    }
    client = new DeepgramClient({ apiKey: DEEPGRAM_API_KEY });
    log.info("Deepgram client initialized");
  }
  return client;
}
