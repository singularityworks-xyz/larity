import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "../../infra/redis";
import { validateEnv } from "./env";
import { rootLogger } from "./logger";
import { startSubscriber, stopSubscriber } from "./subscriber";
import { UtteranceFinalizer } from "./utterance/finalizer";

// biome-ignore lint/performance/noBarrelFile: structure convention
export * from "./channels";
export * from "./utterance/types";

let finalizer: UtteranceFinalizer | null = null;

//graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  rootLogger.info({ signal }, "Received signal, shutting down...");

  try {
    if (finalizer) {
      await finalizer.closeAll();
    }

    await stopSubscriber();
    await disconnectRedis();

    rootLogger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    rootLogger.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  rootLogger.info("============================================");
  rootLogger.info("           Larity Meeting Mode              ");
  rootLogger.info("           Utterance Finalizer              ");
  rootLogger.info("============================================");

  try {
    validateEnv();
    rootLogger.info("Environment variables validated");
  } catch (error) {
    rootLogger.fatal({ err: error }, "Environment validation failed");
    process.exit(1);
  }

  const connected = await connectRedis();
  if (!connected) {
    rootLogger.fatal("Failed to connect to Redis. Exiting.");
    process.exit(1);
  }

  const redisClient = getRedisClient();
  if (!redisClient) {
    rootLogger.fatal("Redis client is not available. Exiting.");
    process.exit(1);
  }

  finalizer = new UtteranceFinalizer({
    publish: (channel, message) => redisClient.publish(channel, message),
  });

  await startSubscriber(finalizer);
  rootLogger.info("Utterance Finalizer is running");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  rootLogger.info("Shutdown handlers registered");
  rootLogger.info("Ready to process STT results");
  rootLogger.info("============================================");
}

main().catch((error) => {
  rootLogger.fatal({ err: error }, "Unhandled error");
  process.exit(1);
});
