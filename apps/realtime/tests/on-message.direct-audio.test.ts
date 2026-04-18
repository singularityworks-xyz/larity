process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "error";

import { describe, expect, it, mock } from "bun:test";

const sendAudioMock = mock(async () => undefined);
const updateLastFrameTsMock = mock(() => undefined);
const publishVadSignalMock = mock(async () => undefined);

mock.module("@larity/stt", () => ({
  env: {
    DEEPGRAM_API_KEY: "test-key",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  },
  sessionManager: {
    sendAudio: sendAudioMock,
  },
  validateEnv: () => undefined,
}));

mock.module("../src/session", () => ({
  updateLastFrameTs: updateLastFrameTsMock,
}));

mock.module("../src/redis/publisher", () => ({
  publishVadSignal: publishVadSignalMock,
}));

import { onMessage } from "../src/handlers/on-message";
import type { RealtimeSocket } from "../src/types";

describe("onMessage direct audio path", () => {
  const sessionId = "session-123";

  const createMockSocket = (role: "host" | "participant") => {
    return {
      data: {
        sessionId,
        role,
        userId: "user-1",
        connectedAt: Date.now(),
        lastFrameTs: Date.now(),
      },
      send: mock(() => undefined),
      close: mock(() => undefined),
    } as unknown as RealtimeSocket;
  };

  it("pipes host binary frames directly to sessionManager.sendAudio", () => {
    sendAudioMock.mockClear();
    updateLastFrameTsMock.mockClear();

    const socket = createMockSocket("host");
    const audioData = Buffer.from("fake-audio");

    onMessage(socket, audioData);

    expect(sendAudioMock).toHaveBeenCalledTimes(1);
    const [calledSessionId, calledFrame] = sendAudioMock.mock.calls[0] ?? [];
    expect(calledSessionId).toBe(sessionId);
    expect(calledFrame).toEqual(audioData);
    expect(updateLastFrameTsMock).toHaveBeenCalledTimes(1);
  });

  it("ignores participant binary frames", () => {
    sendAudioMock.mockClear();

    const socket = createMockSocket("participant");
    onMessage(socket, Buffer.from([1, 2, 3]));

    expect(sendAudioMock).not.toHaveBeenCalled();
  });

  it("routes valid VAD text payloads to Redis publisher", () => {
    publishVadSignalMock.mockClear();

    const socket = createMockSocket("participant");
    onMessage(
      socket,
      JSON.stringify({
        type: "vad_speaking",
        clientSendTs: 123,
      })
    );

    expect(publishVadSignalMock).toHaveBeenCalledTimes(1);
  });
});
