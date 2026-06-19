process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "debug";

import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { env } from "../src/env";

const sendAudioMock = mock(async () => undefined);

mock.module("@larity/stt", () => ({
  env: {
    DEEPGRAM_API_KEY: "test-key",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  },
  validateEnv: () => undefined,
  sessionManager: {
    createSession: mock(() => true),
    hasSession: mock(() => true),
    closeSession: mock(async () => undefined),
    closeAll: mock(async () => undefined),
    sendAudio: sendAudioMock,
    setAudioStreamStart: mock(() => undefined),
  },
}));

const publishParticipantJoinMock = mock(async () => undefined);
const publishVadSignalMock = mock(async () => undefined);

mock.module("../src/redis/publisher", () => ({
  publishSessionStart: async () => undefined,
  publishSessionEnd: async () => undefined,
  publishParticipantJoin: publishParticipantJoinMock,
  publishParticipantLeave: async () => undefined,
  publishVadSignal: publishVadSignalMock,
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

describe("Multi-user session lifecycle", () => {
  let app: ReturnType<typeof startServer> extends Promise<infer T> ? T : never;

  beforeAll(async () => {
    app = await startServer();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(() => {
    if (app) {
      stopServer(app);
    }
  });

  it("handles host and participant connections without crossing audio buffers", async () => {
    publishParticipantJoinMock.mockClear();
    publishVadSignalMock.mockClear();
    sendAudioMock.mockClear();

    const hostWs = new WebSocket(
      `ws://127.0.0.1:${env.PORT}/?sessionId=test-session-multi&userId=host-1&role=host&name=HostUser`
    );
    const guestWs = new WebSocket(
      `ws://127.0.0.1:${env.PORT}/?sessionId=test-session-multi&userId=guest-1&role=participant&name=GuestUser`
    );

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        hostWs.onopen = () => resolve();
        hostWs.onerror = (e) => {
          console.error("Host WS error:", e);
          reject(new Error("Host WebSocket failed"));
        };
      }),
      new Promise<void>((resolve, reject) => {
        guestWs.onopen = () => resolve();
        guestWs.onerror = (e) => {
          console.error("Guest WS error:", e);
          reject(new Error("Guest WebSocket failed"));
        };
      }),
    ]);

    await waitFor(() => publishParticipantJoinMock.mock.calls.length === 2);

    const hostJoined = publishParticipantJoinMock.mock.calls.some(
      (call) => call[0].userId === "host-1"
    );
    const guestJoined = publishParticipantJoinMock.mock.calls.some(
      (call) => call[0].userId === "guest-1"
    );

    expect(hostJoined).toBe(true);
    expect(guestJoined).toBe(true);

    // Host sends audio
    hostWs.send(new Uint8Array([1, 1, 1]));
    // Guest sends audio (should be ignored since only host captures audio)
    guestWs.send(new Uint8Array([2, 2, 2]));

    // Both send VAD
    hostWs.send(
      JSON.stringify({ type: "vad_speaking", clientSendTs: Date.now() })
    );
    guestWs.send(
      JSON.stringify({ type: "vad_speaking", clientSendTs: Date.now() })
    );

    await waitFor(() => publishVadSignalMock.mock.calls.length === 2);

    const vadCalls = publishVadSignalMock.mock.calls;
    expect(vadCalls.some((call) => call[0].userId === "host-1")).toBe(true);
    expect(vadCalls.some((call) => call[0].userId === "guest-1")).toBe(true);

    // Wait a little bit for the guest audio message to be processed (it should be ignored)
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Expect sendAudio to only be called ONCE (from the host)
    expect(sendAudioMock.mock.calls.length).toBe(1);
    const [sessionId, frame] = sendAudioMock.mock.calls[0];
    expect(sessionId).toBe("test-session-multi");
    expect(Buffer.from(frame as Uint8Array)).toEqual(Buffer.from([1, 1, 1]));

    hostWs.close();
    guestWs.close();
  });
});
