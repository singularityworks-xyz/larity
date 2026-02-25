import { createRealtimeLogger } from "../logger";
import { publishAudioFrame } from "../redis/publisher";
import { updateLastFrameTs } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-message");

/**
 * Handle incoming WebSocket message
 *
 * @param ws - The WebSocket connection
 * @param message - Raw message data
 */
export function onMessage(
  ws: RealtimeSocket,
  message: string | Buffer | Uint8Array
): void {
  // We expect binary data (Buffer or Uint8Array)
  if (typeof message === "string") {
    log.warn("Received non-binary frame, ignoring");
    return;
  }

  const data = ws.data;
  const { sessionId, role } = data;
  const ts = Date.now();

  // Only host can send audio
  if (role !== "host") {
    // Ideally we'd log this, but let's avoid spam
    return;
  }

  // Update session timestamp
  updateLastFrameTs(sessionId, ts);

  // Convert to Buffer for Redis if needed
  const frame = Buffer.isBuffer(message) ? message : Buffer.from(message);

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
