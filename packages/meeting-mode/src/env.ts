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

export function validateEnv(): void {
  // Logic only validation if needed
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is required");
  }
}
