import { incrementCounter } from "@larity/stt/metrics";
import type { RealtimeSocket } from "./types";

export const WS_SEND_BACKPRESSURE_BYTES = 256 * 1024;

export type OutboundKind = "partial" | "other";

export function sendSocketMessage(
  socket: RealtimeSocket,
  message: string,
  kind: OutboundKind
): void {
  if (kind === "partial" && isBackpressured(socket)) {
    incrementCounter("realtime.ws_partial_dropped_backpressure_total");
    return;
  }
  try {
    socket.send(message);
  } catch {
    // The socket may have closed after lookup.
  }
}

/**
 * True when the socket's outbound buffer exceeds the shed ceiling.
 *
 * Elysia's wrapper does not proxy `getBufferedAmount` (verified by probe:
 * `typeof ws.getBufferedAmount === "undefined"`), but the underlying Bun
 * socket at `ws.raw` has it. Absent/unreadable (tests, other runtimes) is
 * treated as unpressured — shedding must never trigger on a guess.
 */
function isBackpressured(socket: RealtimeSocket): boolean {
  try {
    const raw = (socket as { raw?: unknown }).raw as
      | { getBufferedAmount?: unknown }
      | undefined;
    const probe = raw?.getBufferedAmount;
    if (typeof probe !== "function") {
      return false;
    }
    const value = (probe as () => unknown).call(raw);
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > WS_SEND_BACKPRESSURE_BYTES
    );
  } catch {
    return false;
  }
}
