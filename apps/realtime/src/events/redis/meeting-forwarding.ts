import { createRealtimeLogger } from "../../logger";
import { broadcast, sendToUser } from "../../sessions/session";

const log = createRealtimeLogger("subscriber");

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

  let wrapped: string;
  try {
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
