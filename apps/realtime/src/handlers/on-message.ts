import { sessionManager } from "@larity/stt";
import { createRealtimeLogger } from "../logger";
import { publishVadSignal } from "../redis/publisher";
import { updateLastFrameTs } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-message");

function extractClientSendTs(
  payload: { clientSendTs?: number; ts?: number },
  fallback: number
): number {
  if (
    typeof payload.clientSendTs === "number" &&
    Number.isFinite(payload.clientSendTs)
  ) {
    return payload.clientSendTs;
  }
  if (typeof payload.ts === "number" && Number.isFinite(payload.ts)) {
    return payload.ts;
  }
  return fallback;
}

function handleVadMessage(
  type: "vad_speaking" | "vad_silence",
  clientSendTs: number,
  userId: string,
  sessionId: string,
  serverReceiveTs: number
): void {
  publishVadSignal({
    type,
    userId,
    sessionId,
    clientSendTs,
    serverReceiveTs,
  }).catch((err) => {
    log.error({ err, sessionId }, "Failed to publish VAD signal");
  });
}

function handleParsedVadPayload(
  payload: { type: string; clientSendTs?: number; ts?: number },
  userId: string,
  sessionId: string,
  ts: number
): void {
  if (payload.type === "vad_speaking" || payload.type === "vad_silence") {
    handleVadMessage(
      payload.type,
      extractClientSendTs(payload, ts),
      userId,
      sessionId,
      ts
    );
  }
}

function handleBinaryFrame(
  message: Buffer | Uint8Array,
  sessionId: string,
  ts: number
): void {
  updateLastFrameTs(sessionId, ts);
  const frame = Buffer.isBuffer(message) ? message : Buffer.from(message);
  sessionManager.sendAudio(sessionId, frame).catch((err) => {
    log.error({ err, sessionId }, "Failed to relay frame to Deepgram");
  });
}

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

  if (
    typeof message === "object" &&
    message !== null &&
    !Buffer.isBuffer(message) &&
    !(message instanceof Uint8Array)
  ) {
    const payload = message as {
      type: string;
      clientSendTs?: number;
      ts?: number;
    };
    handleParsedVadPayload(payload, userId, sessionId, ts);
    return;
  }

  if (typeof message === "string") {
    try {
      handleParsedVadPayload(JSON.parse(message), userId, sessionId, ts);
    } catch {
      log.warn("Received invalid text frame, ignoring");
    }
    return;
  }

  if (role !== "host") {
    return;
  }

  handleBinaryFrame(message, sessionId, ts);
}
