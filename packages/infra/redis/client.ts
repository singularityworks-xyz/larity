import Redis from 'ioredis';

type RedisError = Error & {
    err?: Error;
}

export const redis = new Redis(process.env.REDIS_URL!, {
    lazyConnect:true,
    maxRetriesPerRequest:2,
    enableReadyCheck:true,
    showFriendlyErrorStack:true,
});

export async function connectRedis(){
    try {
        await redis.connect();
        return true;
    } catch (error) {
        console.error('Redis connection error:', error);
        return false;
    }
}