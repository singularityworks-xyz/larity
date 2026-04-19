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

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
export const GEMINI_TIER2_MODEL =
  process.env.GEMINI_TIER2_MODEL || "gemini-3.1-flash-lite-preview";

export function validateEnv(): void {
  // Logic only validation if needed
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for Topic Management");
  }
}
