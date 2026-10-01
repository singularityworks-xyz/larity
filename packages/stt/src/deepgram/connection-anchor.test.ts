import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetMetrics } from "../metrics";
import type { SttResult } from "../types";

type Handler = (...args: unknown[]) => void;

/** Fake socket with manual open control (never auto-opens). */
class ManualLiveSocket {
  readonly handlers = new Map<string, Handler[]>();
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

  sendMedia(): void {
    // noop — delivery is asserted via the queue/metrics, not the socket
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
const published: Array<{ channel: string; result: SttResult }> = [];

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
    publish: (channel: string, message: string) => {
      published.push({ channel, result: JSON.parse(message) as SttResult });
      return Promise.resolve(1);
    },
  },
}));

// Import after mocks so the connection uses the fake client + fake redis.
afterAll(() => mock.restore());

import { DeepgramConnection } from "./connection";

function tick(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finalResult(start: number, duration = 2): Record<string, unknown> {
  return {
    channel: {
      alternatives: [{ confidence: 0.9, transcript: "hello world today" }],
    },
    duration,
    is_final: true,
    speech_final: true,
    start,
    type: "Results",
  };
}

describe("DeepgramConnection speech-timestamp anchor", () => {
  beforeEach(() => {
    createdSockets.length = 0;
    published.length = 0;
    resetMetrics();
  });

  test("first generation uses the client stream anchor plus dropped audio", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    conn.setAudioStreamStart(1_000_000);

    // 70 frames pre-open: 6 drop (6 × 1024 B = 192 ms), 64 deliver.
    const pendings = Array.from({ length: 70 }, () =>
      conn.sendAudio(Buffer.alloc(1024))
    );
    await tick(10);
    (createdSockets[0] as ManualLiveSocket).emit("open");
    await Promise.all(pendings);

    (createdSockets[0] as ManualLiveSocket).emit("message", finalResult(10));
    await tick(10);

    expect(published.length).toBe(1);
    // anchor (1_000_000) + dropped head (192 ms) + Deepgram offset (10 s).
    expect(published[0]?.result.speechTimestamp).toBe(1_010_192);
    expect(published[0]?.channel).toBe("meeting.stt.final.test-session");
  });

  test("anchor is re-derived from server time after reconnect", async () => {
    const conn = new DeepgramConnection("test-session", 0);
    // Stale client anchor from long ago: must not leak into the new socket.
    conn.setAudioStreamStart(1_000_000);

    const firstSend = conn.sendAudio(Buffer.alloc(1024));
    await tick(10);
    const first = createdSockets[0] as ManualLiveSocket;
    first.emit("open");
    await firstSend;

    // Reconnect with a non-idle code: replacement socket opens fresh.
    first.emit("close", { code: 1006 });
    await tick(250);
    expect(createdSockets.length).toBe(2);
    const second = createdSockets[1] as ManualLiveSocket;
    second.emit("open");
    await conn.sendAudio(Buffer.alloc(1024));

    second.emit("message", finalResult(5));
    await tick(10);

    const finals = published.filter((p) => p.result.isFinal);
    expect(finals.length).toBe(1);
    const speechTs = finals[0]?.result.speechTimestamp ?? 0;
    // Near now (+5 s Deepgram offset, minus clamped transit estimate):
    // proving the stale 1_000_000 anchor was abandoned.
    expect(Math.abs(speechTs - 1_005_000)).toBeGreaterThan(60_000);
    expect(speechTs).toBeGreaterThan(Date.now() - 10_000);
    expect(speechTs).toBeLessThan(Date.now() + 10_000);
  });
});
