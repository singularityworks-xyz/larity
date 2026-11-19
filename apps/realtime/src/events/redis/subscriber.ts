import { redisKeys } from "@larity/db/redis/keys";
import { Redis } from "ioredis";
import { createRealtimeLogger } from "../../logger";
import {
  handleAlertChannel,
  handleBroadcastSessionChannel,
  handleProcessedChannel,
  handleSystemEventChannel,
} from "./meeting-forwarding";
import { handleSttChannel } from "./stt-forwarding";

const log = createRealtimeLogger("subscriber");
const pipelineTraceLog = createRealtimeLogger("pipeline-trace");

/** Same semantics as `packages/meeting-mode` `PIPELINE_TRACE_PRETTY_JSON` (default off, opt-in). */
function pipelineTracePrettyLogsEnabled(): boolean {
  const raw = process.env.PIPELINE_TRACE_PRETTY_JSON;
  return raw === "true" || raw === "1";
}

let subscriber: Redis | null = null;

/**
 * Fallback wildcard for `realtime.*` control events (P5.2). Nothing
 * publishes those for this subscriber today (meeting-mode consumes them);
 * the pattern stays so future control traffic needs no code change.
 */
const REALTIME_CONTROL_PATTERN = "realtime.*";

/**
 * Exact per-session channels (P5.2) — the session-scoped equivalents of the
 * nine former global patterns, plus the legacy STT shape. Personal alerts
 * stay a session-scoped pattern (see `sessionPatterns`).
 */
export function sessionChannels(sessionId: string): string[] {
  return [
    redisKeys.meetingUtterance(sessionId),
    redisKeys.meetingTopic(sessionId),
    redisKeys.meetingAlertShared(sessionId),
    `meeting.ledger.${sessionId}`,
    `meeting.pipeline.${sessionId}`,
    redisKeys.meetingSttFinal(sessionId),
    redisKeys.meetingSttPartial(sessionId),
    redisKeys.meetingSttLegacy(sessionId),
    redisKeys.meetingProcessingComplete(sessionId),
    `meeting.speaker_identity_guessed.${sessionId}`,
    redisKeys.meetingSystemEvent(sessionId),
  ];
}

/** Session-scoped patterns: personal alert fan-out for one session. */
export function sessionPatterns(sessionId: string): string[] {
  return [redisKeys.meetingAlertPersonal(sessionId, "*")];
}

const subscribedSessions = new Set<string>();
/** Desired state incl. in-flight ops (true = should be subscribed). */
const desiredSubscriptions = new Set<string>();
/** Serializes subscribe/unsubscribe per session so a fast close cannot leak. */
const subscriptionOps = new Map<string, Promise<void>>();

/**
 * Bring one session's subscription to its desired state, serialized behind
 * any in-flight op for that session. A close that arrives while the initial
 * subscribe is still awaiting Redis is queued here and unsubscribes after —
 * so a replaced/closed session can never leave a dangling subscription.
 */
function reconcileSession(sessionId: string): Promise<void> {
  const previous = subscriptionOps.get(sessionId) ?? Promise.resolve();
  const next = previous
    .then(async () => {
      const shouldSubscribe = desiredSubscriptions.has(sessionId);
      if (shouldSubscribe === subscribedSessions.has(sessionId)) {
        return;
      }
      if (!subscriber) {
        return;
      }
      if (shouldSubscribe) {
        await subscriber.subscribe(...sessionChannels(sessionId));
        try {
          await subscriber.psubscribe(...sessionPatterns(sessionId));
        } catch (error) {
          // Roll back the channel subscribe so a partial failure cannot
          // leave an untracked subscription behind.
          await subscriber
            .unsubscribe(...sessionChannels(sessionId))
            .catch(() => undefined);
          throw error;
        }
        subscribedSessions.add(sessionId);
        log.info({ sessionId }, "Subscribed to session channels");
      } else {
        try {
          await subscriber.unsubscribe(...sessionChannels(sessionId));
          await subscriber.punsubscribe(...sessionPatterns(sessionId));
        } finally {
          // Desired state is "off"; clear tracking even on a failed Redis
          // call so the next reconcile converges instead of desyncing.
          subscribedSessions.delete(sessionId);
        }
        log.info({ sessionId }, "Unsubscribed from session channels");
      }
    })
    .catch((err) => {
      log.error({ err, sessionId }, "Failed to reconcile session subscription");
    });

  subscriptionOps.set(sessionId, next);
  next.finally(() => {
    if (subscriptionOps.get(sessionId) === next) {
      subscriptionOps.delete(sessionId);
    }
  });
  return next;
}

/**
 * Subscribe to one session's channels. Idempotent; called on the session's
 * first connection (any role — participants need the streams too). No-op
 * when the subscriber isn't running.
 */
export async function subscribeSession(sessionId: string): Promise<void> {
  desiredSubscriptions.add(sessionId);
  await reconcileSession(sessionId);
}

/**
 * Leave one session's channels. Called when its last connection closes.
 */
export async function unsubscribeSession(sessionId: string): Promise<void> {
  desiredSubscriptions.delete(sessionId);
  await reconcileSession(sessionId);
}

/**
 * Start the Redis subscriber to listen for meeting events.
 *
 * P5.2: only the `realtime.*` control wildcard is global. Every `meeting.*`
 * stream is subscribed per session on first connection (see
 * `subscribeSession`), so an instance never receives — and never warns
 * about — another instance's sessions.
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

  await subscriber.psubscribe(REALTIME_CONTROL_PATTERN);
  log.info(
    { pattern: REALTIME_CONTROL_PATTERN },
    "Pattern subscribed to realtime control events"
  );

  subscriber.on("message", (channel, message) => {
    handleMessage(channel, channel, message);
  });
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

    if (channel.startsWith("meeting.system_event.")) {
      handleSystemEventChannel(channel, message);
      return;
    }

    if (handleSttChannel(channel, message)) {
      return;
    }

    if (handleProcessedChannel(channel, message)) {
      return;
    }

    if (handleBroadcastSessionChannel(channel, message)) {
      return;
    }

    if (channel.startsWith("meeting.alert.")) {
      // P5.3: single alert log lives in handleAlertChannel (routing
      // outcome); no entry log here.
      handleAlertChannel(channel, message);
    }
  } catch (error) {
    log.error({ err: error, channel }, "Failed to handle Redis message");
  }
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

/** Minimal Redis surface used by session subscriptions (test seam). */
export interface SubscriptionClient {
  psubscribe(...patterns: string[]): Promise<unknown>;
  punsubscribe(...patterns: unknown[]): Promise<unknown>;
  subscribe(...channels: string[]): Promise<unknown>;
  unsubscribe(...channels: unknown[]): Promise<unknown>;
}

export const __test_only_setSubscriptionClient = (
  client: SubscriptionClient | null
): void => {
  subscriber = client as unknown as Redis;
};

export const __test_only_resetSubscriptions = (): void => {
  subscribedSessions.clear();
  desiredSubscriptions.clear();
  subscriptionOps.clear();
  subscriber = null;
};

/**
 * Stop the Redis subscriber
 */
export async function stopSubscriber(): Promise<void> {
  subscribedSessions.clear();
  desiredSubscriptions.clear();
  subscriptionOps.clear();
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    log.info("Redis subscriber stopped");
  }
}
