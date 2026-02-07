/**
 * types.ts — Type definitions for the realtime plane
 *
 * Defines the shape of session data and WebSocket user data.
 */

import type { WebSocket } from "uWebSockets.js";

/**
 * Data attached to each WebSocket connection.
 * uWebSockets stores this in ws.getUserData()
 */
export interface SocketData {
  sessionId: string;
  connectedAt: number;
  lastFrameTs: number;
}

/**
 * Typed WebSocket with our user data
 */
export type RealtimeSocket = WebSocket<SocketData>;

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
