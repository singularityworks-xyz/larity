import { connectRedis } from "@larity/packages/infra/redis";
import { env } from "./env";
import { rootLogger } from "./logger";
import { startServer, stopServer } from "./server";

// Track the Elysia instance for graceful shutdown
// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
let appInstance: any | null = null;

// main entry point
async function main(): Promise<void> {
  rootLogger.info("Starting realtime plane...");
  rootLogger.info({ port: env.PORT }, "Port configured");

  // Connect to Redis
  rootLogger.info("Connecting to Redis...");
  const redisConnected = await connectRedis();

  if (!redisConnected) {
    rootLogger.fatal("FATAL: Could not connect to Redis");
    process.exit(1);
  }
  rootLogger.info("Redis connected");

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
function shutdown(signal: string): void {
  rootLogger.info({ signal }, "Received signal, shutting down...");

  if (appInstance) {
    stopServer(appInstance);
    appInstance = null;
  }

  // Give time for cleanup
  setTimeout(() => {
    rootLogger.info("Shutdown complete");
    process.exit(0);
  }, 1000);
}

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

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
