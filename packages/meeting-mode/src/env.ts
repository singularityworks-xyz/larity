export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ACOUSTIC_BLEED_TIMEOUT_MS = parsePositiveInt(
  process.env.ACOUSTIC_BLEED_TIMEOUT_MS,
  5000
);

export const MERGE_GROUPING_MS = parsePositiveInt(
  process.env.MERGE_GROUPING_MS ?? process.env.MERGE_GAP_MS,
  5000
);

export const MERGE_PUBLISH_GAP_MS = parsePositiveInt(
  process.env.MERGE_PUBLISH_GAP_MS,
  250
);

export const MERGE_GAP_MS = MERGE_GROUPING_MS;

export const LEDGER_SNAPSHOT_DEBOUNCE_MS = parsePositiveInt(
  process.env.LEDGER_SNAPSHOT_DEBOUNCE_MS,
  400
);

export const COST_CAP_CACHE_TTL_MS = parsePositiveInt(
  process.env.COST_CAP_CACHE_TTL_MS,
  500
);

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

export const PIPELINE_TRACE_PRETTY_JSON =
  process.env.PIPELINE_TRACE_PRETTY_JSON === "true" ||
  process.env.PIPELINE_TRACE_PRETTY_JSON === "1";

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
export const GENERALCOMPUTE_API_KEY = process.env.GENERALCOMPUTE_API_KEY || "";
export const GENERALCOMPUTE_BASE_URL =
  process.env.GENERALCOMPUTE_BASE_URL || "https://api.generalcompute.com/v1";
export const GENERALCOMPUTE_TIER2_MODEL =
  process.env.GENERALCOMPUTE_TIER2_MODEL || "gpt-oss-120b";

const tier2TimeoutParsed = Number.parseInt(
  process.env.GENERALCOMPUTE_TIER2_TIMEOUT_MS || "3000",
  10
);

/** General Compute Tier 2 request timeout (`tier2.ts`). Override via `GENERALCOMPUTE_TIER2_TIMEOUT_MS`. Default 3000ms (P2.7: caps per-session FIFO head-of-line blocking; matches docs/TIERING.md). */
export const GENERALCOMPUTE_TIER2_TIMEOUT_MS =
  Number.isFinite(tier2TimeoutParsed) && tier2TimeoutParsed > 0
    ? tier2TimeoutParsed
    : 3000;

export const TIER2_REASONING_EFFORT =
  process.env.TIER2_REASONING_EFFORT || "low";

export const MEETING_PIPELINE_MODE =
  process.env.MEETING_PIPELINE_MODE === "live" ? "live" : "legacy";

export const LIVE_PIPELINE_CONCURRENCY = Math.min(
  4,
  Math.max(1, parsePositiveInt(process.env.LIVE_PIPELINE_CONCURRENCY, 2))
);

export const GEMINI_TIER4_MODEL =
  process.env.GEMINI_TIER4_MODEL || "gemini-3.5-flash-lite";

const tier4TimeoutParsed = Number.parseInt(
  process.env.GEMINI_TIER4_TIMEOUT_MS || "1500",
  10
);

export const GEMINI_TIER4_TIMEOUT_MS =
  Number.isFinite(tier4TimeoutParsed) && tier4TimeoutParsed > 0
    ? tier4TimeoutParsed
    : 1500;

export const SPECULATIVE_ENABLED =
  process.env.SPECULATIVE_ENABLED === "true" ||
  process.env.SPECULATIVE_ENABLED === "1";

export function validateEnv(): void {
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }
  const isDev = process.env.NODE_ENV !== "production";
  if (!GEMINI_API_KEY) {
    if (isDev) {
      console.warn(
        "[meeting-mode] GEMINI_API_KEY not set — AI features disabled"
      );
    } else {
      throw new Error(
        "GEMINI_API_KEY is required for meeting intelligence (topics, embeddings, Tier 4)"
      );
    }
  }
  if (!GENERALCOMPUTE_API_KEY) {
    if (isDev) {
      console.warn(
        "[meeting-mode] GENERALCOMPUTE_API_KEY not set — Tier 2 classification disabled"
      );
    } else {
      throw new Error(
        "GENERALCOMPUTE_API_KEY is required for Tier 2 classification (meeting-mode)"
      );
    }
  }
}
