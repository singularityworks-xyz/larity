import { redis } from "./connection";
import { redisKeys } from "./keys";

export interface RedisHealthStatus {
  error?: string;
  healthy: boolean;
  latency?: number;
  timestamp: number;
}

export async function checkRedisHealth(): Promise<RedisHealthStatus> {
  const startTime = performance.now();
  const timestamp = Date.now();

  try {
    await redis.ping();

    const testKey = redisKeys.health();
    const testValue = `health_check_${Date.now()}`;

    await redis.set(testKey, testValue, "EX", 10);
    const retrievedValue = await redis.get(testKey);

    await redis.del(testKey);

    if (retrievedValue !== testValue) {
      throw new Error("Redis set/get operation failed");
    }

    const latency = performance.now() - startTime;

    return {
      healthy: true,
      latency: Math.round(latency * 100) / 100,
      timestamp,
    };
  } catch (error) {
    const latency = performance.now() - startTime;

    return {
      healthy: false,
      latency: Math.round(latency * 100) / 100,
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp,
    };
  }
}
