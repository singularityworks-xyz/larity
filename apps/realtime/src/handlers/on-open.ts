/**
 * handlers/onOpen.ts — Connection Start
 *
 * Triggered once per WebSocket connection.
 *
 * Step-by-step behavior:
 * 1. Client connects
 * 2. Server extracts sessionId from query
 * 3. If missing → connection is closed immediately
 * 4. Session is added to the session map
 * 5. A session.start event is published to Redis
 *
 * No auth. No validation beyond presence.
 */

import { publishSessionStart } from "../redis/publisher";
import { addSession } from "../session";
import type { RealtimeSocket } from "../types";

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

  console.log(`[onOpen] Session started: ${sessionId}`);

  // Publish session start event to Redis (fire and forget)
  publishSessionStart({
    sessionId,
    ts: data.connectedAt,
  }).catch((err) => {
    console.error(`[onOpen] Failed to publish session start: ${err}`);
  });
}
