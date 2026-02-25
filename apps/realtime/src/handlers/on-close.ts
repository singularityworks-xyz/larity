import { createRealtimeLogger } from "../logger";
import { publishParticipantLeave, publishSessionEnd } from "../redis/publisher";
import { getSession, removeConnection } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-close");

/**
 * Handle WebSocket connection close
 *
 * @param ws - The WebSocket connection
 * @param code - Close code
 * @param message - Close reason
 */
export function onClose(
  ws: RealtimeSocket,
  code: number,
  _message: string
): void {
  const data = ws.data;
  const { sessionId, userId, role, connectedAt } = data;

  // Remove connection from memory
  // returns session if it was the last connection and session is removed
  const sessionRemoved = removeConnection(sessionId, userId);

  const now = Date.now();
  const duration = now - connectedAt;

  log.info({ sessionId, userId, role, code, duration }, "Connection closed");

  // Publish participant leave event
  publishParticipantLeave({
    sessionId,
    userId,
    ts: now,
  }).catch((err) => {
    log.error(
      { err, sessionId, userId },
      "Failed to publish participant leave"
    );
  });

  // If host left or session is empty, publish session end
  const currentSession = getSession(sessionId);
  const isSessionEmpty = !!sessionRemoved;

  if (role === "host" || isSessionEmpty) {
    const sessionData = sessionRemoved || currentSession;
    const sessionDuration = sessionData ? now - sessionData.startedAt : 0;

    publishSessionEnd({
      sessionId,
      ts: now,
      duration: sessionDuration,
    }).catch((err) => {
      log.error({ err, sessionId }, "Failed to publish session end");
    });
  }
}
