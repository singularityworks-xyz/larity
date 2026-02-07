import type uWS from "uWebSockets.js";
import { connectRedis } from "../../../packages/infra/redis";
import { env } from "./env";
import { startServer, stopServer } from "./server";

// Track the listen socket for graceful shutdown
let listenSocket: uWS.us_listen_socket | null = null;

//main entry point
async function main(): Promise<void> {
  console.log("[realtime] Starting realtime plane...");
  console.log(`[realtime] Port: ${env.PORT}`);

  // Connect to Redis
  console.log("[realtime] Connecting to Redis...");
  const redisConnected = await connectRedis();

  if (!redisConnected) {
    console.error("[realtime] FATAL: Could not connect to Redis");
    process.exit(1);
  }
  console.log("[realtime] Redis connected");

  // Start WebSocket server
  try {
    listenSocket = await startServer();
    console.log("[realtime] Realtime plane is ready");
  } catch (error) {
    console.error("[realtime] FATAL: Failed to start WebSocket server:", error);
    process.exit(1);
  }
}

//shutdown handler
function shutdown(signal: string): void {
  console.log(`[realtime] Received ${signal}, shutting down...`);

  if (listenSocket) {
    stopServer(listenSocket);
    listenSocket = null;
  }

  // Give time for cleanup
  setTimeout(() => {
    console.log("[realtime] Shutdown complete");
    process.exit(0);
  }, 1000);
}

// Handle shutdown signals
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error("[realtime] FATAL: Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[realtime] FATAL: Unhandled rejection:", reason);
  process.exit(1);
});

// Start the application
main().catch((error) => {
  console.error("[realtime] FATAL: Startup failed:", error);
  process.exit(1);
});
