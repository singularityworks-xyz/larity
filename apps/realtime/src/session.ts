/**
 * session.ts — Active Session Registry
 *
 * A simple in-memory map tracking currently connected sessions.
 * Supports multiple connections per session (host + participants).
 *
 * What it stores:
 * - Which sessions are currently connected
 * - Connected users and their roles
 * - When the session started
 * - When the last audio frame arrived
 *
 * What it is NOT:
 * - Not durable
 * - Not shared across instances (needs sticky sessions or Redis pub/sub if scaled horizontally)
 * - Not authoritative
 */

import type { RealtimeSocket, SessionConnection, SessionEntry } from "./types";

/**
 * In-memory session registry
 * Key: sessionId
 * Value: SessionEntry (containing multiple connections)
 */
const sessions = new Map<string, SessionEntry>();

/**
 * Register a new connection (host or participant)
 */
export function addConnection(sessionId: string, socket: RealtimeSocket): void {
  const now = Date.now();
  const { userId, role } = socket.data;

  let session = sessions.get(sessionId);

  // Create session if it doesn't exist
  if (!session) {
    session = {
      connections: new Map(),
      startedAt: now,
      lastFrameTs: now,
    };
    sessions.set(sessionId, session);
  }

  // Add connection
  session.connections.set(userId, {
    socket,
    userId,
    role,
    connectedAt: now,
  });
}

/**
 * Remove a connection when a client disconnects
 * Returns the session entry if session is empty (and thus removed)
 */
export function removeConnection(
  sessionId: string,
  userId: string
): SessionEntry | undefined {
  const session = sessions.get(sessionId);
  if (!session) {
    return undefined;
  }

  session.connections.delete(userId);

  // If no connections left, remove the session entirely
  if (session.connections.size === 0) {
    sessions.delete(sessionId);
    return session;
  }

  return undefined;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}

/**
 * Get a specific connection
 */
export function getConnection(
  sessionId: string,
  userId: string
): SessionConnection | undefined {
  const session = sessions.get(sessionId);
  return session?.connections.get(userId);
}

/**
 * Update the last frame timestamp for a session
 */
export function updateLastFrameTs(sessionId: string, ts: number): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastFrameTs = ts;
  }
}

/**
 * Check if a session exists and has connections
 */
export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

/**
 * Broadcast a message to all connections in a session
 */
export function broadcast(sessionId: string, message: string): void {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  for (const connection of session.connections.values()) {
    try {
      connection.socket.send(message);
    } catch (_err) {
      // Ignore send errors
    }
  }
}

/**
 * Send a message to a specific user in a session
 */
export function sendToUser(
  sessionId: string,
  userId: string,
  message: string
): void {
  const connection = getConnection(sessionId, userId);
  if (connection) {
    try {
      connection.socket.send(message);
    } catch (_err) {
      // Ignore send errors
    }
  }
}

/**
 * Get the count of active sessions
 */
export function getSessionCount(): number {
  return sessions.size;
}

/**
 * Get total connection count across all sessions
 */
export function getTotalConnectionCount(): number {
  let count = 0;
  for (const session of sessions.values()) {
    count += session.connections.size;
  }
  return count;
}

/**
 * Get all session IDs
 */
export function getAllSessionIds(): string[] {
  return Array.from(sessions.keys());
}
