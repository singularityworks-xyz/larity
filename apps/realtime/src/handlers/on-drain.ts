/**
 * handlers/onDrain.ts — Backpressure Signal
 *
 * Triggered when uWebSockets internal buffers start filling.
 *
 * What we do here:
 * - Detect slow consumers
 * - Log or mark session degraded
 *
 * What we NEVER do:
 * - Buffer frames
 * - Pause ingestion
 * - Retry sends
 *
 * Realtime systems prefer data loss over delay.
 */

import type { RealtimeSocket } from "../types";

/**
 * Handle backpressure warning from uWebSockets
 *
 * This is called when the socket's send buffer is draining
 * after being full. It's a signal that the client was slow.
 */
export function onDrain(ws: RealtimeSocket): void {
  const data = ws.getUserData();
  const { sessionId } = data;

  // Log the backpressure event for monitoring
  console.warn(`[onDrain] Backpressure relieved for session: ${sessionId}`);

  // Note: uWebSockets calls drain when buffers are emptying
  // If you need to track "was under pressure", you'd track that in onMessage
  // when getBufferedAmount() > threshold
}
