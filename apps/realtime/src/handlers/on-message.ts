import { createRealtimeLogger } from "../logger";
import { publishAudioFrame } from "../redis/publisher";
import { updateLastFrameTs } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-message");

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
    log.warn("Received non-binary frame, ignoring");
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
    source: "system", // In host model, audio is always from system
  }).catch((err) => {
    // Frame is dropped, log and continue
    log.error({ err, sessionId }, "Failed to publish frame");
  });
}
