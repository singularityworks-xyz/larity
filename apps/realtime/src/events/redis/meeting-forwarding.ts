import { createRealtimeLogger } from "../../logger";
import { broadcast, hasSession, sendToUser } from "../../sessions/session";

const log = createRealtimeLogger("subscriber");

const DEBUG_INGEST_ENDPOINT =
  "http://127.0.0.1:7268/ingest/d02c4985-7539-46d4-bc45-33f990c9f9a8";

/**
 * Forward meeting processed events to WebSocket clients.
 * Channel shape: `meeting.processed.{sessionId}`.
 *
 * P5.1: the publisher includes `type: "meeting_processed"`, so the payload
 * is forwarded verbatim.
 */
export function handleProcessedChannel(
  channel: string,
  message: string
): boolean {
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

export function handleBroadcastSessionChannel(
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

export function handleSystemEventChannel(
  channel: string,
  message: string
): boolean {
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

export function handleAlertChannel(channel: string, message: string): void {
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
