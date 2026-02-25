/**
 * env.ts — Environment Configuration
 *
 * Centralized environment variable access with defaults.
 */

import { resolve } from "node:path";
import dotenv from "dotenv";

// Load .env from project root (larity/)
dotenv.config({ path: resolve(import.meta.dir, "../../../../.env") });

/**
 * Deepgram API key (required)
 */
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "";

/**
 * Redis connection URL
 */
export const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Maximum concurrent Deepgram connections per process
 * Deepgram has rate limits, so we cap this
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
 * Validate required environment variables
 */
export function validateEnv(): void {
  if (!DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY environment variable is required");
  }
}
