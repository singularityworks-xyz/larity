import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { getMetricsSnapshot, resetMetrics } from "../metrics";

type Handler = (...args: unknown[]) => void;

/** Fake socket with manual open control (never auto-opens). */
class ManualLiveSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly sentMedia: unknown[] = [];
  closed = false;

  on(event: string, callback: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(callback);
    this.handlers.set(event, list);
  }

  connect(): void {
    // noop — tests emit open manually
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
    this.closed = true;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(...args);
    }
  }
}

const createdSockets: ManualLiveSocket[] = [];
const publishCalls: unknown[][] = [];

mock.module("./client", () => ({
  getDeepgramClient: () => ({
    listen: {
      v1: {
        connect: () => {
          const socket = new ManualLiveSocket();
          createdSockets.push(socket);
          return Promise.resolve(socket);
        },
      },
    },
  }),
}));

mock.module("@larity/db/redis", () => ({
  publishSystemEvent: () => Promise.resolve(),
  redis: {
    publish: (...args: unknown[]) => {
      publishCalls.push(args);
      return Promise.resolve(1);
    },
  },
}));

// Import after mocks so the connection uses the fake client.
afterAll(() => mock.restore());

import { DeepgramConnection } from "./connection";

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("DeepgramConnection pre-connect queue", () => {
  beforeEach(() => {
    createdSockets.length = 0;
    publishCalls.length = 0;
    resetMetrics();
  });

  test("frames arriving during the handshake are delivered in order", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    // 70 frames > 64 cap: frames 0..5 drop, 6..69 deliver in order.
    const frames = Array.from({ length: 70 }, (_, i) =>
      Buffer.alloc(1024, i % 256)
    );
    const pendings = frames.map((frame) => conn.sendAudio(frame));

    await tick(10);
    expect(createdSockets.length).toBe(1);
    const socket = createdSockets[0] as ManualLiveSocket;
    expect(socket.sentMedia.length).toBe(0);

    socket.emit("open");
    await Promise.all(pendings);

    expect(socket.sentMedia.length).toBe(64);
    const firstByte = (entry: unknown): number =>
      new Uint8Array(entry as ArrayBuffer)[0] ?? -1;
    expect(firstByte(socket.sentMedia[0])).toBe(6);
    expect(firstByte(socket.sentMedia[63])).toBe(69);
    expect(
      getMetricsSnapshot().counters["ingest.frames_dropped_connecting_total"]
    ).toBe(6);
  });

  test("preconnect dials without audio and open flushes nothing", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.preconnect();
    await tick(10);
    expect(createdSockets.length).toBe(1);
    expect(conn.connected).toBe(false);

    const socket = createdSockets[0] as ManualLiveSocket;
    socket.emit("open");
    await tick(10);
    expect(conn.connected).toBe(true);
    expect(socket.sentMedia.length).toBe(0);
    // Second preconnect while connected is a no-op.
    conn.preconnect();
    await tick(10);
    expect(createdSockets.length).toBe(1);
  });

  test("sendMedia receives a zero-copy view, not a sliced copy (P4.10)", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.preconnect();
    await tick(10);
    const socket = createdSockets[0] as ManualLiveSocket;
    socket.emit("open");
    await tick(10);

    // A tag-stripped subarray view into a larger buffer, as produced by
    // the dual-channel session.
    const backing = Buffer.alloc(2048, 7);
    const frame = backing.subarray(1, 1025);
    conn.sendAudio(frame);
    await tick(10);

    expect(socket.sentMedia.length).toBe(1);
    const sent = socket.sentMedia[0] as Uint8Array;
    expect(sent).toBeInstanceOf(Uint8Array);
    expect(sent.buffer).toBe(backing.buffer);
    expect(sent.byteOffset).toBe(backing.byteOffset + 1);
    expect(sent.byteLength).toBe(1024);
  });

  test("a sendMedia failure keeps the frame queued for the next flush", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.preconnect();
    await tick(10);
    const socket = createdSockets[0] as ManualLiveSocket;
    socket.emit("open");
    await tick(10);

    const original = socket.sendMedia.bind(socket);
    let attempts = 0;
    socket.sendMedia = (message: unknown) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient send failure");
      }
      original(message);
    };

    conn.sendAudio(Buffer.alloc(1024, 1));
    expect(attempts).toBe(1);
    expect(socket.sentMedia.length).toBe(0);

    // A later frame retries the retained one first, in order.
    conn.sendAudio(Buffer.alloc(1024, 2));
    expect(socket.sentMedia.length).toBe(2);
    const firstByte = (entry: unknown): number =>
      new Uint8Array(entry as ArrayBuffer)[0] ?? -1;
    expect(firstByte(socket.sentMedia[0])).toBe(1);
    expect(firstByte(socket.sentMedia[1])).toBe(2);
  });

  test("sendAudio is synchronous: enqueue happens before any await", () => {
    const conn = new DeepgramConnection("test-session", 0);
    // Not connected: the frame must be queued synchronously (the lazy
    // connect is fire-and-forget and the open handler flushes later).
    const result: unknown = conn.sendAudio(Buffer.alloc(1024));
    expect(result).toBeUndefined();
  });
});
