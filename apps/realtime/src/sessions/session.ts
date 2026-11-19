import { createRealtimeLogger } from "../logger";
import { type OutboundKind, sendSocketMessage } from "../transport/outbound";
import type {
  RealtimeSocket,
  SessionConnection,
  SessionEntry,
} from "../transport/types";

const log = createRealtimeLogger("session");

const sessions = new Map<string, SessionEntry>();

export function addConnection(sessionId: string, socket: RealtimeSocket): void {
  const now = Date.now();
  const { userId, role } = socket.data;

  let session = sessions.get(sessionId);

  if (!session) {
    session = {
      connections: new Map(),
      startedAt: now,
      lastFrameTs: now,
    };
    sessions.set(sessionId, session);
  }

  session.connections.set(userId, {
    socket,
    userId,
    role,
    connectedAt: now,
  });
}

export function removeConnection(
  sessionId: string,
  userId: string,
  closingSocket?: RealtimeSocket
): SessionEntry | undefined {
  const session = sessions.get(sessionId);
  if (!session) {
    return;
  }

  const currentConnection = session.connections.get(userId);
  if (
    currentConnection &&
    (!closingSocket ||
      socketIdentity(currentConnection.socket) ===
        socketIdentity(closingSocket))
  ) {
    session.connections.delete(userId);
  }

  if (session.connections.size === 0) {
    sessions.delete(sessionId);
    return session;
  }

  return;
}

export function getSession(sessionId: string): SessionEntry | undefined {
  return sessions.get(sessionId);
}

/**
 * True when `socket` is the currently-registered connection for this
 * user/session. A stale close (e.g. the previous socket of a replaced
 * connection) must not run teardown side effects against the live session.
 */
export function isActiveConnection(
  sessionId: string,
  userId: string,
  socket: RealtimeSocket
): boolean {
  const connection = getConnection(sessionId, userId);
  if (!connection) {
    return false;
  }
  return socketIdentity(connection.socket) === socketIdentity(socket);
}

export function getConnection(
  sessionId: string,
  userId: string
): SessionConnection | undefined {
  const session = sessions.get(sessionId);
  return session?.connections.get(userId);
}

export function updateLastFrameTs(sessionId: string, ts: number): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastFrameTs = ts;
  }
}

export function hasSession(sessionId: string): boolean {
  return sessions.has(sessionId);
}

export function broadcast(
  sessionId: string,
  message: string,
  kind: OutboundKind = "other"
): void {
  const session = sessions.get(sessionId);
  if (!session) {
    log.warn(
      { sessionId, knownSessions: [...sessions.keys()].slice(0, 5) },
      "broadcast: session not found in map — dropped"
    );
    return;
  }

  for (const connection of session.connections.values()) {
    sendSocketMessage(connection.socket, message, kind);
  }
}

export function sendToUser(
  sessionId: string,
  userId: string,
  message: string,
  kind: OutboundKind = "other"
): void {
  const connection = getConnection(sessionId, userId);
  if (!connection) {
    const session = sessions.get(sessionId);
    log.warn(
      {
        sessionId,
        userId,
        sessionExists: !!session,
        knownUserIds: session
          ? [...session.connections.keys()].slice(0, 10)
          : [],
      },
      "sendToUser: no connection found for userId — message dropped"
    );
    return;
  }
  sendSocketMessage(connection.socket, message, kind);
}

export function getSessionCount(): number {
  return sessions.size;
}

export function getTotalConnectionCount(): number {
  let count = 0;
  for (const session of sessions.values()) {
    count += session.connections.size;
  }
  return count;
}

export function getAllSessionIds(): string[] {
  return Array.from(sessions.keys());
}

/**
 * Test-only reset: clears all session state.
 * Must NOT be used in production code.
 */
export function __test_only_reset(): void {
  sessions.clear();
}

function socketIdentity(socket: RealtimeSocket): unknown {
  return (socket as { raw?: unknown }).raw ?? socket;
}
