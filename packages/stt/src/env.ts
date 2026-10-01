export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const MAX_CONNECTIONS = Number.parseInt(
  process.env.MAX_CONNECTIONS || "50",
  10
);

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Deepgram live-tuning knobs (P5.7). Defaults preserve current behavior;
 * override per-run to measure `stt.audio_end_to_final_ms`. Never change a
 * default without a measured decision-matrix entry in the plan.
 */
export const DEEPGRAM_ENDPOINTING_MS =
  process.env.DEEPGRAM_ENDPOINTING_MS || "450";
export const DEEPGRAM_UTTERANCE_END_MS =
  process.env.DEEPGRAM_UTTERANCE_END_MS || "1000";
/** Set "true" to pass `no_delay=true` (may reduce smart_format hold). */
export const DEEPGRAM_NO_DELAY = process.env.DEEPGRAM_NO_DELAY === "true";
/** Set "false" to skip diarization on the mic channel (host is channel-identified). */
export const DEEPGRAM_DIARIZE_MIC =
  process.env.DEEPGRAM_DIARIZE_MIC !== "false";

export const env = {
  DEEPGRAM_API_KEY,
  REDIS_URL,
  MAX_CONNECTIONS,
  LOG_LEVEL,
} as const;

export function validateEnv(): void {
  if (!DEEPGRAM_API_KEY) {
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      console.warn("[stt] DEEPGRAM_API_KEY not set — STT features disabled");
    } else {
      throw new Error("DEEPGRAM_API_KEY environment variable is required");
    }
  }
}
