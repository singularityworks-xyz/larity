import { Redis } from "ioredis";
import { createRealtimeLogger } from "../logger";
import { broadcast, sendToUser } from "../session";

const log = createRealtimeLogger("subscriber");

let subscriber: Redis | null = null;

/**
 * Start the Redis subscriber to listen for meeting events
 * Connects to Redis and subscribes to relevant channels
 */
export async function startSubscriber(): Promise<void> {
  if (subscriber) {
    return;
  }

  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
  subscriber = new Redis(redisUrl);

  subscriber.on("error", (err) => {
    log.error({ err }, "Redis subscriber error");
  });

  subscriber.on("connect", () => {
    log.info("Redis subscriber connected");
  });

  // Subscribe to patterns
  // Pattern: meeting.utterance.{sessionId}
  // Pattern: meeting.topic.{sessionId}
  // Pattern: meeting.alert.{sessionId}.shared
  // Pattern: meeting.alert.{sessionId}.user.{userId}
  await subscriber.psubscribe(
    "meeting.utterance.*",
    "meeting.topic.*",
    "meeting.alert.*"
  );

  subscriber.on("pmessage", (pattern, channel, message) => {
    handleMessage(pattern, channel, message);
  });
}

/**
 * Handle incoming messages from Redis
 */
function handleMessage(
  pattern: string,
  channel: string,
  message: string
): void {
  // pattern is unused, but required by Redis signature
  const _ = pattern;

  try {
    // 1. Handle Utterances (Broadcast to all)
    if (channel.startsWith("meeting.utterance.")) {
      const sessionId = channel.split(".")[2];
      if (sessionId) {
        broadcast(sessionId, message);
      }
      return;
    }

    // 2. Handle Topics (Broadcast to all)
    if (channel.startsWith("meeting.topic.")) {
      const sessionId = channel.split(".")[2];
      if (sessionId) {
        broadcast(sessionId, message);
      }
      return;
    }

    // 3. Handle Alerts
    if (channel.startsWith("meeting.alert.")) {
      const parts = channel.split(".");
      const sessionId = parts[2];

      // Shared alert: meeting.alert.{sessionId}.shared
      if (parts[3] === "shared") {
        if (sessionId) {
          broadcast(sessionId, message);
        }
        return;
      }

      // Personal alert: meeting.alert.{sessionId}.user.{userId}
      if (parts[3] === "user") {
        const userId = parts[4];
        if (sessionId && userId) {
          sendToUser(sessionId, userId, message);
        }
        return;
      }
    }
  } catch (error) {
    log.error({ err: error, channel }, "Failed to handle Redis message");
  }
}

/**
 * Stop the Redis subscriber
 */
export async function stopSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    log.info("Redis subscriber stopped");
  }
}
