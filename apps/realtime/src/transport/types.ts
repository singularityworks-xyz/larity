/**
 * types.ts — Type definitions for the realtime plane
 *
 * Defines the shape of session data and WebSocket user data.
 */

// We define our custom data that will be attached to Elysia's Context
export interface SocketData {
  connectedAt: number;
  lastFrameTs: number;
  name: string;
  orgId: string;
  role: "host" | "participant";
  sessionId: string;
  userId: string;
}

/**
 * Since we use Elysia, the socket exposes a `data` property.
 * We'll define a generic interface that matches what Elysia gives us
 * so our handlers don't need to import Elysia internals everywhere.
 */
export interface RealtimeSocket {
  close: () => void;
  data: SocketData;
  send: (
    data: string | Buffer | ArrayBuffer | Uint8Array | Record<string, unknown>
  ) => void;
}

/**
 * Connection entry within a session
 */
export interface SessionConnection {
  connectedAt: number;
  role: "host" | "participant";
  socket: RealtimeSocket;
  userId: string;
}

/**
 * Session entry stored in the in-memory registry
 * Handles multiple connections per session
 */
export interface SessionEntry {
  connections: Map<string, SessionConnection>; // key: userId
  lastFrameTs: number;
  startedAt: number;
}

/**
 * Payload structure for VAD signals from clients
 */
export interface VadSignal {
  clientSendTs: number;
  role?: "host" | "participant";
  serverReceiveTs: number;
  sessionId: string;
  type: "vad_speaking" | "vad_silence";
  userId: string;
}

/**
 * Session lifecycle event payloads
 */
export interface SessionStartEvent {
  sessionId: string;
  ts: number;
}

export interface SessionEndEvent {
  duration: number;
  sessionId: string;
  ts: number;
}

export interface ParticipantJoinEvent {
  name: string;
  role: "host" | "participant";
  sessionId: string;
  ts: number;
  userId: string;
}

export interface ParticipantLeaveEvent {
  sessionId: string;
  ts: number;
  userId: string;
}
