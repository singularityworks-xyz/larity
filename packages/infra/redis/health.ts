import { redis } from './client';
import { redisKeys } from './keys';

export interface RedisHealthStatus {
    healthy: boolean;
    latency?: number;
    error?: string;
    timestamp: number;
}

export async function checkRedisHealth(): Promise<RedisHealthStatus> {
    const startTime = Date.now();
    const timestamp = startTime;

    try {
        // Test basic connectivity with ping
        await redis.ping();

        // Test basic operations with a temporary key
        const testKey = redisKeys.health();
        const testValue = `health_check_${Date.now()}`;

        await redis.set(testKey, testValue, 'EX', 10); // Expire in 10 seconds
        const retrievedValue = await redis.get(testKey);

        // Clean up
        await redis.del(testKey);

        // Verify the test worked
        if (retrievedValue !== testValue) {
            throw new Error('Redis set/get operation failed');
        }

        const latency = Date.now() - startTime;

        return {
            healthy: true,
            latency,
            timestamp
        };

    } catch (error) {
        const latency = Date.now() - startTime;

        return {
            healthy: false,
            latency,
            error: error instanceof Error ? error.message : 'Unknown error',
            timestamp
        };
    }
}
