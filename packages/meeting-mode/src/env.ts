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

export function validateEnv(): void {
  console.log("[MeetingMode] Environment Variables:");
  console.log(`  REDIS_URL: ${REDIS_URL}`);
  console.log(`  MERGE_GAP_MS: ${MERGE_GAP_MS}`);
  console.log(`  MAX_BUFFER_SIZE: ${MAX_BUFFER_SIZE}`);
}
