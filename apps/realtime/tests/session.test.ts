import { beforeEach, describe, expect, it } from "bun:test";
import {
  __test_only_reset,
  addConnection,
  getSession,
  getSessionCount,
  getTotalConnectionCount,
  hasSession,
  removeConnection,
} from "../src/session";
import type { RealtimeSocket } from "../src/types";

describe("Multi-User Session Management", () => {
  beforeEach(() => {
    __test_only_reset();
  });

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
      send: (_data: any) => {
        /* mock */
      },
      close: () => {
        /* mock */
      },
    } as unknown as RealtimeSocket;
  };

  it("should manage the complete multi-user session lifecycle", () => {
    // 1. Add host connection
    const hostSocket = createMockSocket(hostId, "host");
    addConnection(sessionId, hostSocket);

    expect(hasSession(sessionId)).toBe(true);
    expect(getSessionCount()).toBe(1);
    expect(getTotalConnectionCount()).toBe(1);

    let session = getSession(sessionId);
    expect(session).toBeDefined();
    expect(session?.connections.size).toBe(1);
    expect(session?.connections.get(hostId)?.role).toBe("host");

    // 2. Add participant connection to the same session
    const participantSocket = createMockSocket(participantId, "participant");
    addConnection(sessionId, participantSocket);

    expect(getSessionCount()).toBe(1); // Still 1 session
    expect(getTotalConnectionCount()).toBe(2); // 2 connections

    session = getSession(sessionId);
    expect(session?.connections.size).toBe(2);
    expect(session?.connections.get(participantId)?.role).toBe("participant");

    // 3. Remove participant connection
    const removedParticipantSession = removeConnection(
      sessionId,
      participantId
    );

    // Session should NOT be removed yet (host still connected)
    expect(removedParticipantSession).toBeUndefined();

    expect(getSessionCount()).toBe(1);
    expect(getTotalConnectionCount()).toBe(1);

    session = getSession(sessionId);
    expect(session?.connections.has(participantId)).toBe(false);
    expect(session?.connections.has(hostId)).toBe(true);

    // 4. Remove host connection (last connection)
    const removedHostSession = removeConnection(sessionId, hostId);

    // Session SHOULD be removed and returned
    expect(removedHostSession).toBeDefined();
    expect(removedHostSession?.startedAt).toBeDefined();

    expect(getSessionCount()).toBe(0);
    expect(getTotalConnectionCount()).toBe(0);
    expect(hasSession(sessionId)).toBe(false);
  });
});
