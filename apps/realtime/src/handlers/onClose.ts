/**
 * handlers/onClose.ts — Connection End
 *
 * Triggered when:
 * - Client disconnects
 * - Network drops
 * - Server closes socket
 *
 * Steps:
 * 1. Remove session from session map
 * 2. Publish session.end event to Redis
 * 3. Release references
 *
 * Downstream services infer "audio ended" from this signal.
 */

import { publishSessionEnd } from '../redis/publisher';
import { removeSession } from '../session';
import type { RealtimeSocket } from '../types';

/**
 * Handle WebSocket connection close
 *
 * @param ws - The WebSocket connection
 * @param code - Close code
 * @param message - Close message (ArrayBuffer)
 */
export function onClose(ws: RealtimeSocket, code: number, _message: ArrayBuffer): void {
  const data = ws.getUserData();
  const { sessionId, connectedAt } = data;

  // Remove session from memory
  const session = removeSession(sessionId);

  const now = Date.now();
  const duration = session ? now - session.connectedAt : now - connectedAt;

  console.log(`[onClose] Session ended: ${sessionId} (code: ${code}, duration: ${duration}ms)`);

  // Publish session end event to Redis (fire and forget)
  publishSessionEnd({
    sessionId,
    ts: now,
    duration,
  }).catch((err) => {
    console.error(`[onClose] Failed to publish session end: ${err}`);
  });
}
