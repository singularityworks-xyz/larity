/**
 * env.ts — Environment Configuration
 *
 * Centralized environment variable access with defaults.
 */

import { resolve } from "node:path";
import dotenv from "dotenv";

// Load .env from project root (larity/)
const meta = import.meta as ImportMeta & { dir: string };
dotenv.config({ path: resolve(meta.dir, "../../../.env") });

/**
 * Deepgram API key (required)
 */
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

/**
 * Redis connection URL
 */
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Maximum concurrent *meeting sessions* (each session opens 2 Deepgram live
 * connections: microphone mono + system capture mono).
 */
export const MAX_CONNECTIONS = Number.parseInt(
  process.env.MAX_CONNECTIONS || "50",
  10
);

/**
 * Log level
 */
export const LOG_LEVEL = process.env.LOG_LEVEL || "info";

/**
 * Environment configuration object
 */
export const env = {
  DEEPGRAM_API_KEY,
  REDIS_URL,
  MAX_CONNECTIONS,
  LOG_LEVEL,
} as const;

/**
 * Validate required environment variables
 */
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
