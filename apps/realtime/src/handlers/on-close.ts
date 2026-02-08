import { createRealtimeLogger } from "../logger";
import { publishSessionEnd } from "../redis/publisher";
import { removeSession } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-close");

/**
 * Handle WebSocket connection close
 *
 * @param ws - The WebSocket connection
 * @param code - Close code
 * @param message - Close message (ArrayBuffer)
 */
export function onClose(
  ws: RealtimeSocket,
  code: number,
  _message: ArrayBuffer
): void {
  const data = ws.getUserData();
  const { sessionId, connectedAt } = data;

  // Remove session from memory
  const session = removeSession(sessionId);

  const now = Date.now();
  const duration = session ? now - session.connectedAt : now - connectedAt;

  log.info({ sessionId, code, duration }, "Session ended");

  // Publish session end event to Redis (fire and forget)
  publishSessionEnd({
    sessionId,
    ts: now,
    duration,
  }).catch((err) => {
    log.error({ err, sessionId }, "Failed to publish session end");
  });
}
