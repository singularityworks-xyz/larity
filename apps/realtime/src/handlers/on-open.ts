import { sessionManager } from "@larity/stt";
import { createStreamer } from "../audio/registry";
import { createRealtimeLogger } from "../logger";
import {
  publishParticipantJoin,
  publishSessionStart,
} from "../redis/publisher";
import { subscribeSession } from "../redis/subscriber";
import { addConnection, getSession, removeConnection } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-open");

/**
 * Handle new WebSocket connection
 * Called when a client successfully upgrades to WebSocket
 */
export function onOpen(ws: RealtimeSocket): void {
  const data = ws.data;
  const { sessionId, userId, role } = data;

  // Session ID is validated in upgrade handler
  // If we get here, we have a valid session

  // Register connection in memory
  addConnection(sessionId, ws);

  const session = getSession(sessionId);
  const isFirstConnection = !!session && session.connections.size === 1;
  const shouldEnsureDeepgramSession =
    role === "host" && !sessionManager.hasSession(sessionId);

  if (shouldEnsureDeepgramSession) {
    const created = sessionManager.createSession(sessionId);
    if (!created) {
      removeConnection(sessionId, userId);
      ws.close();
      log.error(
        { sessionId, userId },
        "Rejected connection: Deepgram session capacity reached"
      );
      return;
    }

    // Start raw audio persistence for host sessions
    try {
      createStreamer(sessionId, data.orgId);
      log.info(
        { sessionId, orgId: data.orgId },
        "Audio persistence streamer created"
      );
    } catch (error) {
      log.error(
        { err: error, sessionId },
        "Failed to create audio persistence streamer — continuing without persistence"
      );
    }

    // Dial Deepgram now so the handshake overlaps the client's first audio
    // instead of serializing after it (lazy connect stays as the fallback).
    sessionManager.connectSession(sessionId);
  }

  // P5.2: subscribe to this session's Redis channels on first connection.
  // After the capacity check so a rejected connection cannot leak a
  // subscription. Fire-and-forget — subscription completes in ms; audio
  // finals take ≥1s. Late-join state comes from the join API, not the stream.
  subscribeSession(sessionId).catch((error) => {
    log.error({ err: error, sessionId }, "Failed to subscribe session");
  });

  log.info({ sessionId, userId, role }, "Connection established");

  // Publish session start event if this is the first connection
  if (isFirstConnection) {
    publishSessionStart({
      sessionId,
      ts: data.connectedAt,
    }).catch((err) => {
      log.error({ err, sessionId }, "Failed to publish session start");
    });
  }

  // Publish participant join event
  publishParticipantJoin({
    sessionId,
    userId,
    name: data.name,
    role,
    ts: data.connectedAt,
  }).catch((err) => {
    log.error({ err, sessionId, userId }, "Failed to publish participant join");
  });
}
