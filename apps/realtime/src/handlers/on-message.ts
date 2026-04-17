import { createRealtimeLogger } from "../logger";
import { publishAudioFrame, publishVadSignal } from "../redis/publisher";
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
  const data = ws.data;
  const { sessionId, role, userId } = data;
  const ts = Date.now();

  // If text, attempt to parse as JSON (e.g., VAD signals)
  if (typeof message === "string") {
    try {
      // The client might send 'ts' directly. Let's accept it as clientSendTs or map it.
      const payload = JSON.parse(message) as {
        type: string;
        clientSendTs?: number;
        ts?: number;
      };
      if (payload.type === "vad_speaking" || payload.type === "vad_silence") {
        publishVadSignal({
          type: payload.type,
          userId,
          sessionId,
          clientSendTs: payload.clientSendTs ?? payload.ts ?? ts,
          serverReceiveTs: ts,
        }).catch((err) => {
          log.error({ err, sessionId }, "Failed to publish VAD signal");
        });
      }
    } catch {
      log.warn("Received invalid text frame, ignoring");
    }
    return;
  }

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
