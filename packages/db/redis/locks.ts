import { redis } from "./connection";
import { redisKeys } from "./keys";
import { TTL } from "./ttl";

export function acquireLock(name: string) {
  return redis
    .set(redisKeys.lock(name), "1", "EX", TTL.LOCK, "NX")
    .then((result: string | null) => result === "OK");
}

export async function releaseLock(name: string) {
  await redis.del(redisKeys.lock(name));
}
