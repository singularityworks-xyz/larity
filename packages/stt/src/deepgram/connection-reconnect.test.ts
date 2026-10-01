import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { getMetricsSnapshot, resetMetrics } from "../metrics";

type Handler = (...args: unknown[]) => void;

/** Minimal fake for the SDK v5 Listen V1 socket used by DeepgramConnection. */
class FakeLiveSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly sentMedia: unknown[] = [];
  closed = false;
  connectCalls = 0;

  on(event: string, callback: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(callback);
    this.handlers.set(event, list);
  }

  connect(): void {
    this.connectCalls += 1;
  }

  waitForOpen(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.on("open", () => resolve(undefined));
      this.on("error", (error) => reject(error));
    });
  }

  sendMedia(message: unknown): void {
    this.sentMedia.push(message);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit("close", { code: 1000 });
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

const createdSockets: FakeLiveSocket[] = [];
const publishMock = mock(() => Promise.resolve(1));

mock.module("./client", () => ({
  getDeepgramClient: () => ({
    listen: {
      v1: {
        connect: () => {
          const socket = new FakeLiveSocket();
          createdSockets.push(socket);
          return Promise.resolve(socket);
        },
      },
    },
  }),
}));

mock.module("@larity/db/redis", () => ({
  publishSystemEvent: () => Promise.resolve(),
  redis: { publish: publishMock },
}));

// Import after mocks so the connection uses the fake client + fake redis.
afterAll(() => mock.restore());

import { DeepgramConnection } from "./connection";

async function connectLive(conn: DeepgramConnection): Promise<FakeLiveSocket> {
  const pending = conn.sendAudio(Buffer.alloc(1024));
  // Let connect() run to waitForOpen, then open the first socket.
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(createdSockets.length).toBeGreaterThan(0);
  createdSockets[0]?.emit("open");
  await pending;
  expect(conn.connected).toBe(true);
  return createdSockets[0] as FakeLiveSocket;
}

describe("DeepgramConnection reconnect ownership", () => {
  beforeEach(() => {
    createdSockets.length = 0;
    publishMock.mockClear();
    resetMetrics();
  });

  test("stale open/close/message events are ignored after reconnect", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    const first = await connectLive(conn);

    // Drop the live socket with a non-idle code → app reconnect (100ms).
    first.emit("close", { code: 1006 });
    // Wait out the backoff + connect of the replacement socket.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(createdSockets.length).toBe(2);
    const second = createdSockets[1] as FakeLiveSocket;
    second.emit("open");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(conn.connected).toBe(true);

    const orphansBefore =
      getMetricsSnapshot().counters["stt.orphan_events_total"];

    // Stale open on the abandoned socket: ignored, orphan closed, live state kept.
    first.emit("open");
    expect(first.closed).toBe(true);
    expect(conn.connected).toBe(true);

    // Stale close must NOT trigger another reconnect (no new socket).
    first.emit("close", { code: 1006 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(createdSockets.length).toBe(2);

    // Stale transcripts must NOT publish.
    first.emit("message", {
      channel: {
        alternatives: [{ confidence: 0.9, transcript: "orphan words" }],
      },
      type: "Results",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(publishMock).not.toHaveBeenCalled();

    const orphansAfter =
      getMetricsSnapshot().counters["stt.orphan_events_total"];
    expect((orphansAfter ?? 0) - (orphansBefore ?? 0)).toBeGreaterThanOrEqual(
      3
    );
  });

  test("reconnect closes the previous socket before creating a new one", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    const first = await connectLive(conn);

    first.emit("close", { code: 1006 });
    await new Promise((resolve) => setTimeout(resolve, 250));

    expect(first.closed).toBe(true);
    expect(createdSockets.length).toBe(2);
    expect(getMetricsSnapshot().counters["stt.reconnects_total"]).toBe(1);
  });

  test("a transient close flushes accumulated intermediate finals", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    const first = await connectLive(conn);

    first.emit("message", {
      is_final: true,
      speech_final: false,
      start: 0,
      duration: 0.5,
      channel: {
        alternatives: [{ confidence: 0.9, transcript: "hello there" }],
      },
      type: "Results",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(publishMock).not.toHaveBeenCalled();

    first.emit("close", { code: 1006 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(publishMock.mock.calls.length).toBe(1);
  });

  test("speech_final publishes once and a following drop does not duplicate it", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    const first = await connectLive(conn);

    first.emit("message", {
      is_final: true,
      speech_final: true,
      start: 0,
      duration: 1,
      channel: {
        alternatives: [{ confidence: 0.9, transcript: "done now" }],
      },
      type: "Results",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(publishMock.mock.calls.length).toBe(1);

    first.emit("close", { code: 1006 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(publishMock.mock.calls.length).toBe(1);
  });

  test("idle close (1011) abandons the generation without reconnecting", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    const first = await connectLive(conn);
    const orphansBefore =
      getMetricsSnapshot().counters["stt.orphan_events_total"] ?? 0;

    first.emit("close", { code: 1011 });
    expect(conn.connected).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    // No scheduled reconnect for an idle close.
    expect(createdSockets.length).toBe(1);

    // Late transcripts from the abandoned socket are ignored.
    first.emit("message", {
      channel: {
        alternatives: [{ confidence: 0.9, transcript: "stale words" }],
      },
      type: "Results",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(publishMock).not.toHaveBeenCalled();
    const orphansAfter =
      getMetricsSnapshot().counters["stt.orphan_events_total"] ?? 0;
    expect(orphansAfter - orphansBefore).toBeGreaterThanOrEqual(1);

    // The next audio frame lazily reconnects.
    conn.sendAudio(Buffer.alloc(1024));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(createdSockets.length).toBe(2);
  });
});
