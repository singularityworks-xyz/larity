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

export async function connectRedis() {
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
