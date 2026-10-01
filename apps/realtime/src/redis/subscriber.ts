import { Redis } from "ioredis";
import { createRealtimeLogger } from "../logger";
import { broadcast, hasSession, sendToUser } from "../session";

const log = createRealtimeLogger("subscriber");
const pipelineTraceLog = createRealtimeLogger("pipeline-trace");

const DEBUG_INGEST_ENDPOINT =
  "http://127.0.0.1:7268/ingest/d02c4985-7539-46d4-bc45-33f990c9f9a8";

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
    `meeting.utterance.${sessionId}`,
    `meeting.topic.${sessionId}`,
    `meeting.alert.${sessionId}.shared`,
    `meeting.ledger.${sessionId}`,
    `meeting.pipeline.${sessionId}`,
    `meeting.stt.final.${sessionId}`,
    `meeting.stt.partial.${sessionId}`,
    `meeting.stt.${sessionId}`,
    `meeting.processed.${sessionId}`,
    `meeting.speaker_identity_guessed.${sessionId}`,
    `meeting.system_event.${sessionId}`,
  ];
}

/** Session-scoped patterns: personal alert fan-out for one session. */
export function sessionPatterns(sessionId: string): string[] {
  return [`meeting.alert.${sessionId}.user.*`];
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

/**
 * Forward raw STT (Deepgram) partials/finals to WebSocket clients before meeting-mode enrichment.
 * Channel shapes: `meeting.stt.final.{sessionId}` (final),
 * `meeting.stt.partial.{sessionId}` (partial), plus legacy `meeting.stt.{sessionId}` (final).
 *
 * P5.1: publishers include the envelope `type`, so new-shape payloads are
 * forwarded byte-verbatim (no parse+spread+stringify per partial). Only the
 * legacy shape still parses to inject the type.
 */
function handleSttChannel(channel: string, message: string): boolean {
  const envelope = parseSttEnvelope(channel);
  if (!envelope) {
    return channel.startsWith("meeting.stt.");
  }

  const segments = channel.split(".");
  if (segments[2] === "final" || segments[2] === "partial") {
    // P5.5: partials are sheddable per socket; finals never shed.
    broadcast(
      envelope.sessionId,
      message,
      envelope.type === "stt_partial" ? "partial" : "other"
    );
    return true;
  }

  try {
    const payload = JSON.parse(message) as Record<string, unknown>;
    const wrapped = JSON.stringify({ ...payload, type: envelope.type });
    broadcast(envelope.sessionId, wrapped);
  } catch (error) {
    log.warn({ err: error, channel }, "Invalid STT JSON from Redis");
  }

  return true;
}

/**
 * Parse an STT Redis channel into its envelope type + session id.
 * Returns null when the channel is not an STT channel at all.
 */
export function parseSttEnvelope(channel: string): {
  sessionId: string;
  type: "stt_partial" | "stt_final";
} | null {
  if (!channel.startsWith("meeting.stt.")) {
    return null;
  }

  const parts = channel.split(".");
  if (parts[0] !== "meeting" || parts[1] !== "stt") {
    return null;
  }

  if (parts[2] === "partial" && parts.length >= 4) {
    const sessionId = parts.slice(3).join(".");
    return sessionId ? { sessionId, type: "stt_partial" } : null;
  }

  if (parts[2] === "final" && parts.length >= 4) {
    const sessionId = parts.slice(3).join(".");
    return sessionId ? { sessionId, type: "stt_final" } : null;
  }

  // Legacy pre-P1.1 final shape `meeting.stt.<sessionId>`. A bare `final`
  // or `partial` third segment is a malformed channel, not a session id.
  if (parts.length >= 3) {
    const sessionId = parts.slice(2).join(".");
    if (sessionId && sessionId !== "final" && sessionId !== "partial") {
      return { sessionId, type: "stt_final" };
    }
    return null;
  }

  return null;
}

/**
 * Forward meeting processed events to WebSocket clients.
 * Channel shape: `meeting.processed.{sessionId}`.
 *
 * P5.1: the publisher includes `type: "meeting_processed"`, so the payload
 * is forwarded verbatim.
 */
function handleProcessedChannel(channel: string, message: string): boolean {
  if (!channel.startsWith("meeting.processed.")) {
    return false;
  }

  const parts = channel.split(".");
  const sessionId = parts[2];
  if (!sessionId) {
    return true;
  }

  broadcast(sessionId, message);
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
    "meeting.speaker_identity_guessed.",
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

function handleSystemEventChannel(channel: string, message: string): boolean {
  if (!channel.startsWith("meeting.system_event.")) {
    return false;
  }

  const parts = channel.split(".");
  const sessionId = parts[2];
  if (!sessionId) {
    return true;
  }

  // P5.1: `publishSystemEvent` already includes `type: "system_event"` —
  // forward verbatim.
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

  // #region agent log
  if (process.env.DEBUG_ALERT_INGEST === "true") {
    let category: string | null = null;
    let alertRouting: string | null = null;
    try {
      const o = JSON.parse(message) as Record<string, unknown>;
      if (typeof o.category === "string") {
        category = o.category;
      }
      if (typeof o.routing === "string") {
        alertRouting = o.routing;
      }
    } catch {
      /* ignore */
    }
    const sessionLive = hasSession(sessionId);
    fetch(DEBUG_INGEST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "6eb14a",
      },
      body: JSON.stringify({
        sessionId: "6eb14a",
        runId: "post-fix",
        hypothesisId: "B",
        location: "subscriber.ts:handleAlertChannel",
        message: "Redis alert channel received",
        data: {
          channelSuffix: "REDACTED",
          redisSessionId: "REDACTED",
          route,
          category,
          alertRouting,
          sessionLive,
          personalTargetUserId: "REDACTED",
          personalHasSocket: null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => undefined);
  }
  // #endregion

  let wrapped: string;
  try {
    // P5.1: publishers include `type: "alert"`; forward verbatim. Validate
    // only (no spread/re-stringify) so corrupt payloads still drop here.
    JSON.parse(message) as unknown;
    wrapped = message;
  } catch {
    return;
  }

  if (route === "shared") {
    broadcast(sessionId, wrapped);
    log.info(
      {
        sessionId,
        channelLen: channel.length,
      },
      "handleAlertChannel: broadcast alert to session"
    );
    return;
  }

  if (route !== "user") {
    return;
  }

  const userId = parts[4];
  if (!userId) {
    return;
  }

  sendToUser(sessionId, userId, wrapped);
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
export const __test_only_handleProcessedChannel = handleProcessedChannel;

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
