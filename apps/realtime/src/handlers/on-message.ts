import { sessionManager } from "@larity/stt";
import { createRealtimeLogger } from "../logger";
import { publishVadSignal } from "../redis/publisher";
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
  message: string | Buffer | Uint8Array | Record<string, unknown>
): void {
  const data = ws.data;
  const { sessionId, role, userId } = data;
  const ts = Date.now();

  // Handle VAD signals (Elysia auto-parses JSON text frames into objects)
  if (
    typeof message === "object" &&
    message !== null &&
    !Buffer.isBuffer(message) &&
    !(message instanceof Uint8Array)
  ) {
    const payload = message as Record<string, unknown>;
    if (payload.type === "vad_speaking" || payload.type === "vad_silence") {
      publishVadSignal({
        type: payload.type as "vad_speaking" | "vad_silence",
        userId,
        sessionId,
        clientSendTs:
          (payload.clientSendTs as number) ?? (payload.ts as number) ?? ts,
        serverReceiveTs: ts,
      }).catch((err) => {
        log.error({ err, sessionId }, "Failed to publish VAD signal");
      });
    }
    return;
  }

  // If text (backward compat for non-Elysia or raw string frames)
  if (typeof message === "string") {
    try {
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

  // Pipe frame directly to Deepgram session owned by this worker.
  // Audio bytes must never be routed through Redis.
  sessionManager.sendAudio(sessionId, frame).catch((err) => {
    // Frame is dropped, log and continue
    log.error({ err, sessionId }, "Failed to relay frame to Deepgram");
  });
}
