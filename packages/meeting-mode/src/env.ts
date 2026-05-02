import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const MERGE_GAP_MS = Number.parseInt(
  process.env.MERGE_GAP_MS || "5000",
  10
);

export const MAX_BUFFER_SIZE = Number.parseInt(
  process.env.MAX_BUFFER_SIZE || "20",
  10
);

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Indent JSON on `meeting.pipeline.*` and use multiline trace logs (meeting-mode + realtime).
 * On by default when NODE_ENV !== "production". Disable with PIPELINE_TRACE_PRETTY_JSON=false.
 */
export const PIPELINE_TRACE_PRETTY_JSON =
  process.env.PIPELINE_TRACE_PRETTY_JSON !== "false" &&
  process.env.PIPELINE_TRACE_PRETTY_JSON !== "0" &&
  (process.env.PIPELINE_TRACE_PRETTY_JSON === "true" ||
    process.env.PIPELINE_TRACE_PRETTY_JSON === "1" ||
    process.env.NODE_ENV !== "production");

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_TIER2_MODEL =
  process.env.GEMINI_TIER2_MODEL || "gemini-3.1-flash-lite-preview";

export const GEMINI_TIER4_MODEL =
  process.env.GEMINI_TIER4_MODEL || "gemini-3.1-flash-lite-preview";

const tier4TimeoutParsed = Number.parseInt(
  process.env.GEMINI_TIER4_TIMEOUT_MS || "1500",
  10
);

/** Gemini Tier 4 `Promise.race` budget (`tier4.ts`). Override via `GEMINI_TIER4_TIMEOUT_MS`. */
export const GEMINI_TIER4_TIMEOUT_MS =
  Number.isFinite(tier4TimeoutParsed) && tier4TimeoutParsed > 0
    ? tier4TimeoutParsed
    : 1500;

export function validateEnv(): void {
  // Logic only validation if needed
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is required for meeting intelligence (topics, embeddings, Tier 2 / Tier 4)"
    );
  }
}
