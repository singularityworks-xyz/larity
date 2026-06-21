export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const MAX_CONNECTIONS = Number.parseInt(
  process.env.MAX_CONNECTIONS || "50",
  10
);

export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

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
