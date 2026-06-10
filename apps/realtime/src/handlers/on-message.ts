import { sessionManager } from "@larity/stt";
import { getStreamer } from "../audio/registry";
import { createRealtimeLogger } from "../logger";
import {
  publishParticipantRoleChange,
  publishVadSignal,
} from "../redis/publisher";
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
  serverReceiveTs: number,
  role?: "host" | "participant"
): void {
  publishVadSignal({
    type,
    userId,
    sessionId,
    clientSendTs,
    serverReceiveTs,
    role,
  }).catch((err) => {
    log.error({ err, sessionId }, "Failed to publish VAD signal");
  });
}

function handleParsedVadPayload(
  payload: {
    type: string;
    clientSendTs?: number;
    ts?: number;
    clientTs?: number;
  },
  userId: string,
  sessionId: string,
  ts: number,
  role?: "host" | "participant"
): void {
  if (payload.type === "audio_stream_start") {
    const { clientTs, clientSendTs } = payload;
    if (
      Number.isFinite(clientTs) &&
      Number.isFinite(clientSendTs) &&
      Number.isFinite(ts)
    ) {
      // Estimate one-way network latency as half of the observed RTT
      // (Server receive time - Client send time)
      const networkLatency = Math.max(
        0,
        Math.min(500, (ts - clientSendTs) / 2)
      );
      const serverAudioStartTs = clientTs + networkLatency;

      log.info(
        {
          sessionId,
          serverAudioStartTs,
          clientTs,
          clientSendTs,
          networkLatency,
        },
        "Syncing audio stream start with network-aware offset"
      );
      sessionManager.setAudioStreamStart(sessionId, serverAudioStartTs);
    }
    return;
  }

  if (payload.type === "participant_role_change") {
    const { speakerId, role: newRole } = payload as unknown as {
      speakerId: string;
      role: "TEAM" | "EXTERNAL";
    };
    if (
      typeof speakerId === "string" &&
      (newRole === "TEAM" || newRole === "EXTERNAL")
    ) {
      publishParticipantRoleChange(sessionId, {
        speakerId,
        role: newRole,
      }).catch((err) => {
        log.error(
          { err, sessionId },
          "Failed to publish participant role change"
        );
      });
    }
    return;
  }

  if (payload.type === "vad_speaking" || payload.type === "vad_silence") {
    handleVadMessage(
      payload.type as "vad_speaking" | "vad_silence",
      extractClientSendTs(payload, ts),
      userId,
      sessionId,
      ts,
      role
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

  // Fire-and-forget S3 audio persistence — errors never block live processing
  const streamer = getStreamer(sessionId);
  if (streamer && !streamer.done) {
    try {
      if (frame.length > 0) {
        const tag = frame[0];
        const pcm = frame.subarray(1);
        streamer.writeDemux(tag, pcm);
      }
    } catch (error) {
      log.error(
        { err: error, sessionId },
        "Failed to write frame to audio persistence — continuing without"
      );
    }
  }
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
    handleParsedVadPayload(payload, userId, sessionId, ts, role);
    return;
  }

  if (typeof message === "string") {
    try {
      handleParsedVadPayload(JSON.parse(message), userId, sessionId, ts, role);
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
