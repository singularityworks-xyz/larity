/**
 * session.ts — Active Session Registry
 *
 * A simple in-memory map tracking currently connected sessions.
 *
 * What it stores:
 * - Which sessions are currently connected
 * - When they connected
 * - When the last audio frame arrived
 *
 * What it is NOT:
 * - Not durable
 * - Not shared
 * - Not authoritative
 *
 * If the process restarts, this map is empty. That is fine.
 */

import type { RealtimeSocket, SessionEntry } from './types';

/**
 * In-memory session registry
 * Key: sessionId
 * Value: SessionEntry
 */
const sessions = new Map<string, SessionEntry>();

/**
 * Register a new session when a client connects
 */
export function addSession(sessionId: string, socket: RealtimeSocket): void {
  const now = Date.now();
  sessions.set(sessionId, {
    socket,
    connectedAt: now,
    lastFrameTs: now,
  });
}

/**
 * Remove a session when a client disconnects
 */
export function removeSession(sessionId: string): SessionEntry | undefined {
  const entry = sessions.get(sessionId);
  sessions.delete(sessionId);
  return entry;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}

/**
 * Update the last frame timestamp for a session
 */
export function updateLastFrameTs(sessionId: string, ts: number): void {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.lastFrameTs = ts;
  }
}

/**
 * Check if a session exists
 */
export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Get the count of active sessions (for monitoring)
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Get all session IDs (for debugging only)
 */
export function getAllSessionIds(): string[] {
  return Array.from(sessions.keys());
}
