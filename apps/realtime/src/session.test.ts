import { describe, expect, it } from "bun:test";
import {
  addConnection,
  getSession,
  getSessionCount,
  getTotalConnectionCount,
  hasSession,
  removeConnection,
} from "./session";
import type { RealtimeSocket } from "./types";

describe("Multi-User Session Management", () => {
  const sessionId = "session-123";
  const hostId = "user-host";
  const participantId = "user-participant";

  // Mock sockets
  const createMockSocket = (userId: string, role: "host" | "participant") => {
    return {
      data: {
        sessionId,
        userId,
        role,
        connectedAt: Date.now(),
        lastFrameTs: Date.now(),
      },
      send: (data: any) => {}, // Mock send
      close: () => {},
    } as unknown as RealtimeSocket;
  };

  it("should add a host connection", () => {
    const socket = createMockSocket(hostId, "host");
    addConnection(sessionId, socket);

    expect(hasSession(sessionId)).toBe(true);
    expect(getSessionCount()).toBe(1);
    expect(getTotalConnectionCount()).toBe(1);

    const session = getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.connections.size).toBe(1);
    expect(session?.connections.get(hostId)?.role).toBe("host");
  });

  it("should add a participant connection to the same session", () => {
    const socket = createMockSocket(participantId, "participant");
    addConnection(sessionId, socket);

    expect(getSessionCount()).toBe(1); // Still 1 session
    expect(getTotalConnectionCount()).toBe(2); // 2 connections

    const session = getSession(sessionId);
    expect(session?.connections.size).toBe(2);
    expect(session?.connections.get(participantId)?.role).toBe("participant");
  });

  it("should remove a participant connection", () => {
    const removedSession = removeConnection(sessionId, participantId);

    // Session should NOT be removed yet
    expect(removedSession).toBeUndefined();

    expect(getSessionCount()).toBe(1);
    expect(getTotalConnectionCount()).toBe(1);

    const session = getSession(sessionId);
    expect(session?.connections.has(participantId)).toBe(false);
    expect(session?.connections.has(hostId)).toBe(true);
  });

  it("should remove the last connection and the session", () => {
    const removedSession = removeConnection(sessionId, hostId);

    // Session SHOULD be removed and returned
    expect(removedSession).toBeDefined();
    expect(removedSession?.startedAt).toBeDefined();

    expect(getSessionCount()).toBe(0);
    expect(getTotalConnectionCount()).toBe(0);
    expect(hasSession(sessionId)).toBe(false);
  });
});
