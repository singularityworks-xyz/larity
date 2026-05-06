import { setupTelemetry } from "@larity/telemetry";

// Initialize telemetry before other imports
setupTelemetry("realtime");

import { connectRedis } from "@larity/packages/infra/redis";
import {
  sessionManager,
  env as sttEnv,
  validateEnv as validateSttEnv,
} from "@larity/stt";

if (!process.env.DEEPGRAM_API_KEY && sttEnv.DEEPGRAM_API_KEY) {
  process.env.DEEPGRAM_API_KEY = sttEnv.DEEPGRAM_API_KEY;
}

if (!process.env.REDIS_URL && sttEnv.REDIS_URL) {
  process.env.REDIS_URL = sttEnv.REDIS_URL;
}

import { env } from "./env";
import { rootLogger } from "./logger";
import { startSubscriber, stopSubscriber } from "./redis/subscriber";
import { startServer, stopServer } from "./server";

// Track the Elysia instance for graceful shutdown
// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
let appInstance: any | null = null;

// main entry point
async function main(): Promise<void> {
  rootLogger.info("Starting realtime plane...");
  rootLogger.info({ port: env.PORT }, "Port configured");

  try {
    validateSttEnv();
  } catch (error) {
    rootLogger.fatal(
      { err: error },
      "FATAL: STT environment validation failed"
    );
    process.exit(1);
  }

  // Connect to Redis
  rootLogger.info("Connecting to Redis...");
  const redisConnected = await connectRedis();

  if (!redisConnected) {
    rootLogger.fatal("FATAL: Could not connect to Redis");
    process.exit(1);
  }
  rootLogger.info("Redis connected");

  // Start Redis subscriber to relay pipeline output to WebSocket clients
  try {
    await startSubscriber();
    rootLogger.info("Redis subscriber started");
  } catch (error) {
    rootLogger.fatal({ err: error }, "FATAL: Failed to start Redis subscriber");
    process.exit(1);
  }

  // Start WebSocket server
  try {
    appInstance = await startServer();
    rootLogger.info("Realtime plane is ready");
  } catch (error) {
    rootLogger.fatal({ err: error }, "FATAL: Failed to start WebSocket server");
    process.exit(1);
  }
}

// shutdown handler
async function shutdown(signal: string): Promise<void> {
  rootLogger.info({ signal }, "Received signal, shutting down...");

  if (appInstance) {
    stopServer(appInstance);
    appInstance = null;
  }

  try {
    await stopSubscriber();
  } catch (error) {
    rootLogger.error({ err: error }, "Error while stopping Redis subscriber");
  }

  try {
    await sessionManager.closeAll();
  } catch (error) {
    rootLogger.error({ err: error }, "Error while closing Deepgram sessions");
  }

  rootLogger.info("Shutdown complete");
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    rootLogger.error({ err: error }, "SIGTERM shutdown failed");
    process.exit(1);
  });
});
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    rootLogger.error({ err: error }, "SIGINT shutdown failed");
    process.exit(1);
  });
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  rootLogger.fatal({ err: error }, "FATAL: Uncaught exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  rootLogger.fatal({ err: reason }, "FATAL: Unhandled rejection");
  process.exit(1);
});

// Start the application
main().catch((error) => {
  rootLogger.fatal({ err: error }, "FATAL: Startup failed");
  process.exit(1);
});
