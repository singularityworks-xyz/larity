import { beforeEach, describe, expect, test } from "bun:test";
import { getMetricsSnapshot, resetMetrics } from "@larity/stt/metrics";
import {
  addConnection,
  broadcast,
  isActiveConnection,
  removeConnection,
  __test_only_reset as resetSessions,
  sendToUser,
  WS_SEND_BACKPRESSURE_BYTES,
} from "./session";
import type { RealtimeSocket } from "./types";

function makeSocket(bufferedBytes?: number): RealtimeSocket & {
  sent: unknown[];
} {
  const sent: unknown[] = [];
  const socket = {
    close: () => undefined,
    data: {
      connectedAt: Date.now(),
      lastFrameTs: Date.now(),
      name: "",
      orgId: "default",
      role: "host" as const,
      sessionId: "s1",
      userId: "u1",
    },
    send: (data: unknown) => {
      sent.push(data);
    },
    sent,
  } as RealtimeSocket & { sent: unknown[] };
  if (bufferedBytes !== undefined) {
    (socket as unknown as Record<string, unknown>).raw = {
      getBufferedAmount: () => bufferedBytes,
    };
  }
  return socket;
}

function connectUser(
  sessionId: string,
  userId: string,
  bufferedBytes?: number
) {
  const socket = makeSocket(bufferedBytes);
  addConnection(sessionId, {
    ...socket,
    data: { ...socket.data, sessionId, userId },
  } as RealtimeSocket);
  return socket;
}

describe("WS send backpressure (P5.5)", () => {
  beforeEach(() => {
    resetSessions();
    resetMetrics();
  });

  test("unpressured partials are delivered", () => {
    const socket = connectUser("s1", "u1", 0);
    broadcast("s1", "partial-1", "partial");
    expect(socket.sent).toEqual(["partial-1"]);
  });

  test("partials shed past 256KB, counted, per socket", () => {
    const slow = connectUser("s1", "u-slow", WS_SEND_BACKPRESSURE_BYTES + 1);
    const fast = connectUser("s1", "u-fast", 1024);
    broadcast("s1", "partial-2", "partial");
    expect(slow.sent).toEqual([]);
    expect(fast.sent).toEqual(["partial-2"]);
    expect(
      getMetricsSnapshot().counters[
        "realtime.ws_partial_dropped_backpressure_total"
      ]
    ).toBe(1);
  });

  test("exactly at the ceiling still sends (strictly-greater shed)", () => {
    const socket = connectUser("s1", "u1", WS_SEND_BACKPRESSURE_BYTES);
    broadcast("s1", "partial-3", "partial");
    expect(socket.sent).toEqual(["partial-3"]);
  });

  test("finals and alerts are never shed", () => {
    const socket = connectUser("s1", "u1", WS_SEND_BACKPRESSURE_BYTES * 4);
    broadcast("s1", "final-1", "other");
    expect(socket.sent).toEqual(["final-1"]);
  });

  test("sendToUser applies the same policy", () => {
    const pressured = connectUser("s1", "u1", WS_SEND_BACKPRESSURE_BYTES + 1);
    sendToUser("s1", "u1", "partial-4", "partial");
    expect(pressured.sent).toEqual([]);
    sendToUser("s1", "u1", "alert-1", "other");
    expect(pressured.sent).toEqual(["alert-1"]);
  });

  test("sockets without raw introspection are never shed", () => {
    const socket = connectUser("s1", "u1");
    broadcast("s1", "partial-5", "partial");
    expect(socket.sent).toEqual(["partial-5"]);
    expect(
      getMetricsSnapshot().counters[
        "realtime.ws_partial_dropped_backpressure_total"
      ] ?? 0
    ).toBe(0);
  });
});

describe("removeConnection socket identity (P5.2)", () => {
  beforeEach(() => {
    resetSessions();
  });

  function makeRawSocket(
    sessionId: string,
    userId: string,
    raw: object
  ): RealtimeSocket {
    const socket = makeSocket();
    (socket as unknown as Record<string, unknown>).raw = raw;
    addConnection(sessionId, {
      ...socket,
      data: { ...socket.data, sessionId, userId },
    } as RealtimeSocket);
    return socket;
  }

  test("close wrapper sharing the raw socket removes the connection", () => {
    const raw = {};
    makeRawSocket("s1", "u1", raw);
    // Elysia hands a DIFFERENT wrapper to close for the same connection.
    const closeSocket = makeSocket() as RealtimeSocket;
    (closeSocket as unknown as Record<string, unknown>).raw = raw;

    const removed = removeConnection("s1", "u1", closeSocket);
    expect(removed).toBeDefined();
  });

  test("stale close with a different raw socket keeps the fresh connection", () => {
    makeRawSocket("s1", "u1", {});
    const stale = makeSocket() as RealtimeSocket;
    (stale as unknown as Record<string, unknown>).raw = {};

    const removed = removeConnection("s1", "u1", stale);
    expect(removed).toBeUndefined();
  });

  test("wrappers without raw keep reference identity", () => {
    const socket = makeSocket();
    // Store the identical wrapper (no spread copy): removal matches.
    addConnection("s1", socket as RealtimeSocket);
    const removed = removeConnection("s1", "u1", socket);
    expect(removed).toBeDefined();
  });

  test("isActiveConnection is true for the live socket and false for a stale one", () => {
    const raw = {};
    const live = makeRawSocket("s1", "u1", raw);
    expect(isActiveConnection("s1", "u1", live)).toBe(true);

    // A different wrapper sharing the raw socket is still the same connection.
    const closeWrapper = makeSocket() as RealtimeSocket;
    (closeWrapper as unknown as Record<string, unknown>).raw = raw;
    expect(isActiveConnection("s1", "u1", closeWrapper)).toBe(true);

    // A different raw socket is a stale/replaced connection.
    const stale = makeSocket() as RealtimeSocket;
    (stale as unknown as Record<string, unknown>).raw = {};
    expect(isActiveConnection("s1", "u1", stale)).toBe(false);
  });
});
