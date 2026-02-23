/**
 * types.ts — Type definitions for the realtime plane
 *
 * Defines the shape of session data and WebSocket user data.
 */

// We define our custom data that will be attached to Elysia's Context
export interface SocketData {
  sessionId: string;
  connectedAt: number;
  lastFrameTs: number;
}

/**
 * Since we use Elysia, the socket exposes a `data` property.
 * We'll define a generic interface that matches what Elysia gives us
 * so our handlers don't need to import Elysia internals everywhere.
 */
export interface RealtimeSocket {
  data: SocketData;
  send: (
    data: string | Buffer | ArrayBuffer | Uint8Array | Record<string, unknown>
  ) => void;
  close: () => void;
}

/**
 * Session entry stored in the in-memory registry
 */
export interface SessionEntry {
  socket: RealtimeSocket;
  connectedAt: number;
  lastFrameTs: number;
}

/**
 * Payload structure for audio frames published to Redis
 */
export interface AudioFramePayload {
  sessionId: string;
  ts: number;
  frame: Buffer;
  source: "mic" | "system";
}

/**
 * Session lifecycle event payloads
 */
export interface SessionStartEvent {
  sessionId: string;
  ts: number;
}

export interface SessionEndEvent {
  sessionId: string;
  ts: number;
  duration: number;
}
