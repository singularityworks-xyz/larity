import { createRealtimeLogger } from "../../logger";
import { broadcast } from "../../sessions/session";

const log = createRealtimeLogger("subscriber");

/**
 * Forward raw STT (Deepgram) partials/finals to WebSocket clients before meeting-mode enrichment.
 * Channel shapes: `meeting.stt.final.{sessionId}` (final),
 * `meeting.stt.partial.{sessionId}` (partial), plus legacy `meeting.stt.{sessionId}` (final).
 *
 * P5.1: publishers include the envelope `type`, so new-shape payloads are
 * forwarded byte-verbatim (no parse+spread+stringify per partial). Only the
 * legacy shape still parses to inject the type.
 */
export function handleSttChannel(channel: string, message: string): boolean {
  const envelope = parseSttEnvelope(channel);
  if (!envelope) {
    return channel.startsWith("meeting.stt.");
  }

  const segments = channel.split(".");
  if (segments[2] === "final" || segments[2] === "partial") {
    broadcast(
      envelope.sessionId,
      message,
      envelope.type === "stt_partial" ? "partial" : "other"
    );
    return true;
  }

  try {
    const payload = JSON.parse(message) as Record<string, unknown>;
    const wrapped = JSON.stringify({ ...payload, type: envelope.type });
    broadcast(envelope.sessionId, wrapped);
  } catch (error) {
    log.warn({ err: error, channel }, "Invalid STT JSON from Redis");
  }

  return true;
}

export function parseSttEnvelope(channel: string): {
  sessionId: string;
  type: "stt_partial" | "stt_final";
} | null {
  if (!channel.startsWith("meeting.stt.")) {
    return null;
  }

  const parts = channel.split(".");
  if (parts[0] !== "meeting" || parts[1] !== "stt") {
    return null;
  }

  if (parts[2] === "partial" && parts.length >= 4) {
    const sessionId = parts.slice(3).join(".");
    return sessionId ? { sessionId, type: "stt_partial" } : null;
  }

  if (parts[2] === "final" && parts.length >= 4) {
    const sessionId = parts.slice(3).join(".");
    return sessionId ? { sessionId, type: "stt_final" } : null;
  }

  if (parts.length >= 3) {
    const sessionId = parts.slice(2).join(".");
    if (sessionId && sessionId !== "final" && sessionId !== "partial") {
      return { sessionId, type: "stt_final" };
    }
    return null;
  }

  return null;
}
