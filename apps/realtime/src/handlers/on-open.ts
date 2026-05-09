import { sessionManager } from "@larity/stt";
import { createRealtimeLogger } from "../logger";
import {
  publishParticipantJoin,
  publishSessionStart,
} from "../redis/publisher";
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
  }

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
