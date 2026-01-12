import Redis, { type Redis as RedisInstance } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  showFriendlyErrorStack: true,
});

export async function connectRedis() {
  try {
    await redis.connect();
    return true;
  } catch (error) {
    console.error('Redis connection error:', error);
    return false;
  }
}

export function getRedisClient(): RedisInstance {
  return redis;
}

export async function disconnectRedis(): Promise<void> {
  redis.disconnect();
  console.log('[Redis] Disconnected');
}
