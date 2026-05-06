import { Redis } from "ioredis";
import { createRealtimeLogger } from "../logger";
import { broadcast, sendToUser } from "../session";

const log = createRealtimeLogger("subscriber");
const pipelineTraceLog = createRealtimeLogger("pipeline-trace");

/** Same semantics as `packages/meeting-mode` `PIPELINE_TRACE_PRETTY_JSON` */
function pipelineTracePrettyLogsEnabled(): boolean {
  const raw = process.env.PIPELINE_TRACE_PRETTY_JSON;
  if (raw === "false" || raw === "0") {
    return false;
  }
  if (raw === "true" || raw === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

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
  // Pattern: meeting.pipeline.{sessionId} — tier / gate trace (logged only, no WS relay)
  // Pattern: meeting.stt.* — raw Deepgram partials + finals (forwarded to WS for live transcript)
  await subscriber.psubscribe(
    "meeting.utterance.*",
    "meeting.topic.*",
    "meeting.alert.*",
    "meeting.ledger.*",
    "meeting.pipeline.*",
    "meeting.stt.*"
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
    if (channel.startsWith("meeting.pipeline.")) {
      handlePipelineTraceMessage(message);
      return;
    }

    if (handleSttChannel(channel, message)) {
      return;
    }

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

/**
 * Forward raw STT (Deepgram) partials/finals to WebSocket clients before meeting-mode enrichment.
 * Channel shapes: `meeting.stt.{sessionId}` (final), `meeting.stt.partial.{sessionId}` (partial).
 */
function handleSttChannel(channel: string, message: string): boolean {
  if (!channel.startsWith("meeting.stt.")) {
    return false;
  }

  const parts = channel.split(".");
  if (parts[0] !== "meeting" || parts[1] !== "stt") {
    return true;
  }

  let sessionId: string;
  let envelopeType: "stt_partial" | "stt_final";

  if (parts[2] === "partial" && parts.length >= 4) {
    envelopeType = "stt_partial";
    sessionId = parts.slice(3).join(".");
  } else if (parts.length >= 3) {
    envelopeType = "stt_final";
    sessionId = parts.slice(2).join(".");
  } else {
    return true;
  }

  if (!sessionId) {
    return true;
  }

  try {
    const payload = JSON.parse(message) as Record<string, unknown>;
    const wrapped = JSON.stringify({ ...payload, type: envelopeType });
    broadcast(sessionId, wrapped);
  } catch (error) {
    log.warn({ err: error, channel }, "Invalid STT JSON from Redis");
  }

  return true;
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

function handlePipelineTraceMessage(message: string): void {
  try {
    const data = JSON.parse(message) as {
      sessionId?: string;
      utteranceId?: string;
      terminalLine?: string;
      [key: string]: unknown;
    };
    if (
      !(typeof data.terminalLine === "string" && data.terminalLine.length > 0)
    ) {
      return;
    }
    const display = pipelineTracePrettyLogsEnabled()
      ? `${data.terminalLine}\n${JSON.stringify(data, null, 2)}`
      : data.terminalLine;
    pipelineTraceLog.info(
      {
        sessionId: data.sessionId,
        utteranceId: data.utteranceId,
      },
      display
    );
  } catch (error) {
    log.warn({ err: error }, "Invalid meeting.pipeline trace JSON");
  }
}

export const __test_only_handleBroadcastSessionChannel =
  handleBroadcastSessionChannel;
export const __test_only_handleAlertChannel = handleAlertChannel;
export const __test_only_handleSttChannel = handleSttChannel;

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
