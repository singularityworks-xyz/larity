process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "debug";

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { env } from "../src/env";

const createSessionMock = mock(() => true);
const hasSessionMock = mock(() => false);
const closeSessionMock = mock(async () => undefined);
const closeAllMock = mock(async () => undefined);
const sendAudioMock = mock(async () => undefined);

mock.module("@larity/stt", () => ({
  env: {
    DEEPGRAM_API_KEY: "test-key",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  },
  validateEnv: () => undefined,
  sessionManager: {
    createSession: createSessionMock,
    hasSession: hasSessionMock,
    closeSession: closeSessionMock,
    closeAll: closeAllMock,
    sendAudio: sendAudioMock,
  },
}));

mock.module("../src/redis/publisher", () => ({
  publishSessionStart: async () => undefined,
  publishSessionEnd: async () => undefined,
  publishParticipantJoin: async () => undefined,
  publishParticipantLeave: async () => undefined,
  publishVadSignal: async () => undefined,
}));

import { startServer, stopServer } from "../src/server";

function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (predicate()) {
        clearInterval(interval);
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timed out waiting for condition"));
      }
    }, 20);
  });
}

describe("direct audio integration", () => {
  let app: ReturnType<typeof startServer> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    app = await startServer();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(() => {
    if (app) {
      stopServer(app);
      app = null;
    }
  });

  it("routes host binary websocket frames directly to sessionManager.sendAudio", async () => {
    sendAudioMock.mockClear();
    createSessionMock.mockClear();

    const ws = new WebSocket(
      `ws://127.0.0.1:${env.PORT}/?sessionId=test-session-direct&userId=host-user&role=host`
    );

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket open failed"));
    });

    ws.send(new Uint8Array([1, 2, 3, 4]));

    await waitFor(() => sendAudioMock.mock.calls.length === 1);

    const [calledSessionId, calledFrame] = sendAudioMock.mock.calls[0] ?? [];
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(calledSessionId).toBe("test-session-direct");
    expect(Buffer.from(calledFrame as Uint8Array)).toEqual(
      Buffer.from([1, 2, 3, 4])
    );

    ws.close();
  });
});
