import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "../../infra/redis";
import { validateEnv } from "./env";
import { startSubscriber, stopSubscriber } from "./subscriber";
import { UtteranceFinalizer } from "./utterance/finalizer";

// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./channels";
export * from "./utterance/types";

let finalizer: UtteranceFinalizer | null = null;

//graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[MeetingMode] Received ${signal}, shutting down...`);

  try {
    if (finalizer) {
      await finalizer.closeAll();
    }

    await stopSubscriber();
    await disconnectRedis();

    console.log("[MeetingMode] Shutdown complete.");
    process.exit(0);
  } catch (error) {
    console.error("[MeetingMode] Error during shutdown:", error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  console.log("============================================");
  console.log("           Larity Meeting Mode              ");
  console.log("           Utterance Finalizer              ");
  console.log("============================================");

  try {
    validateEnv();
    console.log("[MeetingMode] Environment variables validated.");
  } catch (error) {
    console.error("[MeetingMode] Environment validation failed:", error);
    process.exit(1);
  }

  const connected = await connectRedis();
  if (!connected) {
    console.error("[MeetingMode] Failed to connect to Redis. Exiting.");
    process.exit(1);
  }

  const redisClient = getRedisClient();
  if (!redisClient) {
    console.error("[MeetingMode] Redis client is not available. Exiting.");
    process.exit(1);
  }

  finalizer = new UtteranceFinalizer({
    publish: (channel, message) => redisClient.publish(channel, message),
  });

  await startSubscriber(finalizer);
  console.log("[MeetingMode] Utterance Finalizer is running.");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[MeetingMode] Shutdown handlers registered.");
  console.log("[MeetingMode] Ready to process STT results.");
  console.log("============================================");
}

main().catch((error) => {
  console.error("[MeetingMode] Unhandled error:", error);
  process.exit(1);
});
