import { resolve } from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: resolve(__dirname, "../../../.env") });

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Max time between identical utterances to be considered acoustic bleed
 */
export const ACOUSTIC_BLEED_TIMEOUT_MS = parsePositiveInt(
  process.env.ACOUSTIC_BLEED_TIMEOUT_MS,
  5000
);

/**
 * Max silence between same-speaker finals to merge into one utterance (`UtteranceMerger`).
 * Legacy: `MERGE_GAP_MS` applies when `MERGE_GROUPING_MS` is unset.
 */
export const MERGE_GROUPING_MS = parsePositiveInt(
  process.env.MERGE_GROUPING_MS ?? process.env.MERGE_GAP_MS,
  5000
);

/**
 * After pending audio end, flush publish if no sibling arrives (`UtteranceFinalizer` timer).
 * Defaults ~700ms so transcript/alerts are not held for the full grouping window.
 */
export const MERGE_PUBLISH_GAP_MS = parsePositiveInt(
  process.env.MERGE_PUBLISH_GAP_MS,
  700
);

/** @deprecated Prefer `MERGE_GROUPING_MS`; kept for docs/tests expecting one knob */
export const MERGE_GAP_MS = MERGE_GROUPING_MS;

/** Debounce Redis snapshot writes for commitment/constraint ledgers */
export const LEDGER_SNAPSHOT_DEBOUNCE_MS = parsePositiveInt(
  process.env.LEDGER_SNAPSHOT_DEBOUNCE_MS,
  400
);

/** Hot-path cache TTL for session cost gate reads (`CostManager`) */
export const COST_CAP_CACHE_TTL_MS = parsePositiveInt(
  process.env.COST_CAP_CACHE_TTL_MS,
  500
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

export const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
export const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || "";
export const SAMBANOVA_TIER2_MODEL =
  process.env.SAMBANOVA_TIER2_MODEL || "gpt-oss-120b";

const tier2TimeoutParsed = Number.parseInt(
  process.env.SAMBANOVA_TIER2_TIMEOUT_MS || "8000",
  10
);

/** SambaNova Tier 2 request timeout (`tier2.ts`). Override via `SAMBANOVA_TIER2_TIMEOUT_MS`. Default 8000ms. */
export const SAMBANOVA_TIER2_TIMEOUT_MS =
  Number.isFinite(tier2TimeoutParsed) && tier2TimeoutParsed > 0
    ? tier2TimeoutParsed
    : 8000;

export const GEMINI_TIER4_MODEL =
  process.env.GEMINI_TIER4_MODEL || "gemini-3.1-flash-lite";

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
      "GEMINI_API_KEY is required for meeting intelligence (topics, embeddings, Tier 4)"
    );
  }
  if (!SAMBANOVA_API_KEY) {
    throw new Error(
      "SAMBANOVA_API_KEY is required for Tier 2 classification (meeting-mode)"
    );
  }
}
