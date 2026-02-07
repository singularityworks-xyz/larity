import { redis } from "./client";
import { redisKeys } from "./keys";
import { TTL } from "./ttl";

export function acquireLock(name: string) {
  return redis
    .set(redisKeys.lock(name), "1", "EX", TTL.LOCK, "NX")
    .then((result) => result === "OK");
}

export async function releaseLock(name: string) {
  await redis.del(redisKeys.lock(name));
}
