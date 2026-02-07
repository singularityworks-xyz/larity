/**
 * index.ts — STT Package Entry Point
 *
 * Wires everything together and provides the main entry point.
 * Handles graceful shutdown on SIGINT/SIGTERM.
 */

import { connectRedis } from "../../infra/redis";
import { validateEnv } from "./env";
import { sessionManager } from "./session-manager";
import { startSubscriber, stopSubscriber } from "./subscriber";

// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./channels";
// Re-export public types
export * from "./types";

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[STT] Received ${signal}, initiating graceful shutdown...`);

  // Close all Deepgram connections
  await sessionManager.closeAll();

  // Stop Redis subscriber
  await stopSubscriber();

  console.log("[STT] Shutdown complete");
  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log("========================================");
  console.log("  Larity STT Subscriber");
  console.log("========================================");

  // Validate environment
  try {
    validateEnv();
    console.log("[STT] Environment validated");
  } catch (error) {
    console.error("[STT] Environment validation failed:", error);
    process.exit(1);
  }

  // Connect to Redis (for publishing)
  const redisConnected = await connectRedis();
  if (!redisConnected) {
    console.error("[STT] Failed to connect to Redis");
    process.exit(1);
  }
  console.log("[STT] Redis connected (publisher)");

  // Start subscriber
  await startSubscriber();
  console.log("[STT] Subscriber started");

  // Register shutdown handlers
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("----------------------------------------");
  console.log("[STT] Ready to process audio streams");
  console.log("----------------------------------------");
}

// Run if executed directly
main().catch((error) => {
  console.error("[STT] Fatal error:", error);
  process.exit(1);
});
