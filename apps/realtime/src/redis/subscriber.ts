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
    "meeting.alert.*",
    "meeting.ledger.*"
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
    if (handleBroadcastSessionChannel(channel, message)) {
      return;
    }

    if (channel.startsWith("meeting.alert.")) {
      handleAlertChannel(channel, message);
    }
  } catch (error) {
    log.error({ err: error, channel }, "Failed to handle Redis message");
  }
}

function handleBroadcastSessionChannel(
  channel: string,
  message: string
): boolean {
  const isBroadcastChannel = [
    "meeting.utterance.",
    "meeting.topic.",
    "meeting.ledger.",
  ].some((prefix) => channel.startsWith(prefix));

  if (!isBroadcastChannel) {
    return false;
  }

  const sessionId = channel.split(".")[2];
  if (!sessionId) {
    return true;
  }

  broadcast(sessionId, message);
  return true;
}

function handleAlertChannel(channel: string, message: string): void {
  const parts = channel.split(".");
  const sessionId = parts[2];
  const route = parts[3];

  if (sessionId === undefined || route === undefined) {
    return;
  }

  if (route === "shared") {
    broadcast(sessionId, message);
    return;
  }

  if (route !== "user") {
    return;
  }

  const userId = parts[4];
  if (!userId) {
    return;
  }

  sendToUser(sessionId, userId, message);
}

export const __test_only_handleBroadcastSessionChannel =
  handleBroadcastSessionChannel;
export const __test_only_handleAlertChannel = handleAlertChannel;

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
