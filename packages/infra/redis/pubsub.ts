import { redis } from "./client";

export async function publish(channel: string, payload: unknown) {
  await redis.publish(channel, JSON.stringify(payload));
}
