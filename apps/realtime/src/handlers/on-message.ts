/**
 * handlers/onMessage.ts — Audio Ingestion (Critical Path)
 *
 * This runs for every audio frame. THE HOT PATH.
 *
 * Exact responsibilities:
 * - Check message type (must be binary)
 * - Treat payload as opaque bytes (no decoding, no parsing)
 * - Capture a timestamp
 * - Update lastFrameTs in session
 * - Publish to Redis immediately
 *
 * Important constraints:
 * - No buffering
 * - No retries
 * - No async chains that block
 * - Minimal allocations
 *
 * If Redis is slow: frames are dropped, system continues.
 * This protects latency.
 */

import { publishAudioFrame } from "../redis/publisher";
import { updateLastFrameTs } from "../session";
import type { RealtimeSocket } from "../types";

/**
 * Handle incoming WebSocket message
 *
 * @param ws - The WebSocket connection
 * @param message - Raw message data (ArrayBuffer)
 * @param isBinary - Whether the message is binary
 */
export function onMessage(
  ws: RealtimeSocket,
  message: ArrayBuffer,
  isBinary: boolean
): void {
  // Reject non-binary frames immediately
  if (!isBinary) {
    console.warn("[onMessage] Received non-binary frame, ignoring");
    return;
  }

  const data = ws.getUserData();
  const { sessionId } = data;
  const ts = Date.now();

  // Update session timestamp
  updateLastFrameTs(sessionId, ts);

  // Convert ArrayBuffer to Buffer for Redis
  const frame = Buffer.from(message);

  // Publish to Redis (fire and forget)
  // No await - we don't block on Redis
  publishAudioFrame({
    sessionId,
    ts,
    frame,
  }).catch((err) => {
    // Frame is dropped, log and continue
    console.error(`[onMessage] Failed to publish frame for ${sessionId}:`, err);
  });
}
