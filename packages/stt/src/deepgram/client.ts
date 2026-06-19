import { DeepgramClient } from "@deepgram/sdk";
import WS from "ws";
import { DEEPGRAM_API_KEY } from "../env";
import { createSttLogger } from "../logger";

// WORKAROUND: @deepgram/sdk (v5.1.0) internally uses the `ws` module and attempts to
// set `binaryType = 'blob'` on the WebSocket connection. The `ws` module explicitly throws
// an "Invalid binaryType: blob" error because it only supports nodebuffer, arraybuffer, and fragments.
// This patch intercepts the setter to silently convert "blob" to "arraybuffer" to prevent fatal crashes.
const originalDescriptor = Object.getOwnPropertyDescriptor(WS.prototype, "binaryType");
if (originalDescriptor) {
  Object.defineProperty(WS.prototype, "binaryType", {
    get() {
      return originalDescriptor.get?.call(this);
    },
    set(value) {
      if (value === "blob") {
        originalDescriptor.set?.call(this, "arraybuffer");
        return;
      }
      originalDescriptor.set?.call(this, value);
    },
    enumerable: originalDescriptor.enumerable,
    configurable: originalDescriptor.configurable,
  });
}

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
