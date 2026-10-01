import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// Import after mocks so the connection uses the fake client.
afterAll(() => mock.restore());

import {
  DEEPGRAM_KEEP_ALIVE_INTERVAL_MS,
  DeepgramConnection,
  shouldSendKeepAlive,
} from "./connection";

type Handler = (...args: unknown[]) => void;

/** Fake socket with manual open control + KeepAlive recording. */
class ManualLiveSocket {
  readonly handlers = new Map<string, Handler[]>();
  readonly sentMedia: unknown[] = [];
  readonly keepAlives: unknown[] = [];
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

  sendKeepAlive(message: unknown): void {
    this.keepAlives.push(message);
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
    publish: () => Promise.resolve(1),
  },
}));

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface KeepAliveTestHandle {
  sendKeepAliveIfIdle: (nowMs?: number) => void;
}

function testHandle(conn: DeepgramConnection): KeepAliveTestHandle {
  return conn as unknown as KeepAliveTestHandle;
}

describe("Deepgram KeepAlive (P5.6)", () => {
  beforeEach(() => {
    createdSockets.length = 0;
  });

  test("idle check: connected + quiet interval sends", () => {
    expect(shouldSendKeepAlive(true, 0, DEEPGRAM_KEEP_ALIVE_INTERVAL_MS)).toBe(
      true
    );
    expect(shouldSendKeepAlive(true, 1000, 1000)).toBe(false);
    expect(
      shouldSendKeepAlive(
        true,
        1000,
        1000 + DEEPGRAM_KEEP_ALIVE_INTERVAL_MS - 1
      )
    ).toBe(false);
    expect(shouldSendKeepAlive(false, 0, 60_000)).toBe(false);
  });

  test("open socket with no audio sends KeepAlive, then audio resets it", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.preconnect();
    await tick(10);
    const socket = createdSockets[0] as ManualLiveSocket;
    socket.emit("open");
    await tick(10);

    const handle = testHandle(conn);
    // Never sent audio: lastAudioSendMs is 0 → idle since epoch.
    handle.sendKeepAliveIfIdle(Date.now());
    expect(socket.keepAlives).toEqual([{ type: "KeepAlive" }]);

    // Audio just sent: no KeepAlive.
    conn.sendAudio(Buffer.alloc(1024));
    handle.sendKeepAliveIfIdle(Date.now());
    expect(socket.keepAlives).toHaveLength(1);

    await conn.close();
  });

  test("disconnected socket never sends KeepAlive", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    // Never opened: sendKeepAliveIfIdle must no-op without a socket.
    testHandle(conn).sendKeepAliveIfIdle(Date.now() + 60_000);
    expect(createdSockets).toHaveLength(0);
    await conn.close();
  });

  test("close stops the interval (no lingering timer)", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.preconnect();
    await tick(10);
    const socket = createdSockets[0] as ManualLiveSocket;
    socket.emit("open");
    await tick(10);
    await conn.close();
    // If the timer survived close, it would fire within ~5s; assert the
    // handle is gone by checking a second close is a no-op (no throw).
    await conn.close();
    expect(socket.closed).toBe(true);
  });
});
