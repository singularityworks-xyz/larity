import { createRealtimeLogger } from "../logger";
import { publishSessionStart } from "../redis/publisher";
import { addSession } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-open");

/**
 * Handle new WebSocket connection
 * Called when a client successfully upgrades to WebSocket
 */
export function onOpen(ws: RealtimeSocket): void {
  const data = ws.getUserData();
  const { sessionId } = data;

  // Session ID is validated in upgrade handler
  // If we get here, we have a valid session

  // Register session in memory
  addSession(sessionId, ws);

  log.info({ sessionId }, "Session started");

  // Publish session start event to Redis (fire and forget)
  publishSessionStart({
    sessionId,
    ts: data.connectedAt,
  }).catch((err) => {
    log.error({ err, sessionId }, "Failed to publish session start");
  });
}
