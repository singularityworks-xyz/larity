import { redis } from './client';
import { TTL } from './ttl';
import { redisKeys } from './keys';

export async function acquireLock(name: string) {
    return redis.set(
        redisKeys.lock(name),
        '1',
        'EX',
        TTL.LOCK,
        'NX'
    ).then((result) => result === 'OK');
}

export async function releaseLock(name:string) {
    await redis.del(redisKeys.lock(name));
}