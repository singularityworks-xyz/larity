/**
 * redis/channels.ts — Naming Contract
 *
 * Defines Redis channel names for the realtime plane.
 *
 * Purpose:
 * - Enforce consistent Redis topics
 * - Avoid string duplication
 * - Make cross-service integration predictable
 *
 * Nothing dynamic lives here except naming functions.
 */

/**
 * Channel prefix for all realtime plane events
 */
const PREFIX = 'realtime';

/**
 * Per-session audio stream channel
 * Used for publishing raw audio frames for a specific session
 */
export function audioChannel(sessionId: string): string {
  return `${PREFIX}.audio.${sessionId}`;
}

/**
 * Global session start event channel
 * Published when a new WebSocket connection is established
 */
export const SESSION_START = `${PREFIX}.session.start`;

/**
 * Global session end event channel
 * Published when a WebSocket connection closes
 */
export const SESSION_END = `${PREFIX}.session.end`;

/**
 * All channel names for documentation/debugging
 */
export const channels = {
  audioChannel,
  SESSION_START,
  SESSION_END,
} as const;
