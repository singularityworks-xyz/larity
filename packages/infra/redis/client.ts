import Redis, { type Redis as RedisInstance } from "ioredis";
import { createInfraLogger } from "../logger";

const log = createInfraLogger("redis-client");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  showFriendlyErrorStack: true,
});

redis.on("error", (error) => {
  if (process.env.NODE_ENV === "test") {
    // Swallow error during unit tests so it doesn't crash the test runner
    return;
  }
  log.error({ err: error }, "Unhandled Redis error event");
});

export async function connectRedis() {
  const status = redis.status;

  if (status === "ready" || status === "connect") {
    log.info("Redis already connected");
    return true;
  }

  if (status === "connecting" || status === "reconnecting") {
    log.info("Redis is already connecting, waiting...");
    await redis.ping();
    log.info("Redis connected (waited for existing connection)");
    return true;
  }

  try {
    await redis.connect();
    log.info("Redis connected");
    return true;
  } catch (error) {
    log.error({ err: error }, "Redis connection error");
    return false;
  }
}

export function getRedisClient(): RedisInstance {
  return redis;
}

export function disconnectRedis(): void {
  redis.disconnect();
  log.info("Redis disconnected");
}
