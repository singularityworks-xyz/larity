import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Must mock BEFORE imports to prevent real Redis/Deepgram init
mock.module("@larity/infra/redis", () => ({
  redis: {
    publish: mock(() => Promise.resolve(1)),
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => undefined),
  },
  connectRedis: mock(() => Promise.resolve(true)),
}));

mock.module("./deepgram/client", () => ({
  getDeepgramClient: mock(() => ({
    listen: {
      live: mock(() => ({
        on: mock(),
        send: mock(),
        requestClose: mock(),
      })),
    },
  })),
}));

import { SessionManager } from "./session-manager";

describe("SessionManager", () => {
  let closeMock: ReturnType<typeof mock>;
  let sendAudioMock: ReturnType<typeof mock>;
  let connectionFactory: ReturnType<typeof mock>;
  let manager: SessionManager;

  beforeEach(() => {
    closeMock = mock(() => undefined);
    sendAudioMock = mock(async () => undefined);
    connectionFactory = mock(() => ({
      close: closeMock,
      sendAudio: sendAudioMock,
      setAudioStreamStart: mock(() => undefined),
    }));

    manager = new SessionManager(connectionFactory);
  });

  afterEach(() => {
    manager.closeAll();
  });

  it("creates one Deepgram connection per session", () => {
    const created = manager.createSession("session-a");

    expect(created).toBe(true);
    expect(manager.sessionCount).toBe(1);
    expect(connectionFactory).toHaveBeenCalledTimes(1);
    expect(connectionFactory).toHaveBeenCalledWith("session-a");
  });

  it("does not create duplicate session connections", () => {
    const first = manager.createSession("session-a");
    const second = manager.createSession("session-a");

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(manager.sessionCount).toBe(1);
    expect(connectionFactory).toHaveBeenCalledTimes(1);
  });

  it("routes audio only to the matching session", async () => {
    manager.createSession("session-a");

    await manager.sendAudio("session-a", Buffer.from([1, 2, 3]));
    await manager.sendAudio("missing-session", Buffer.from([4, 5, 6]));

    expect(sendAudioMock).toHaveBeenCalledTimes(1);
    expect(sendAudioMock).toHaveBeenCalledWith(Buffer.from([1, 2, 3]));
  });

  it("closes and removes session connections", () => {
    manager.createSession("session-a");
    expect(manager.hasSession("session-a")).toBe(true);

    manager.closeSession("session-a");

    expect(closeMock).toHaveBeenCalledTimes(1);
    expect(manager.hasSession("session-a")).toBe(false);
    expect(manager.sessionCount).toBe(0);
  });

  it("setAudioStreamStart delegates to the underlying connection", () => {
    manager.createSession("session-a");

    manager.setAudioStreamStart("session-a", 1_234_567_890);

    const connection = connectionFactory.mock.results[0]?.value;
    expect(connection.setAudioStreamStart).toHaveBeenCalledWith(1_234_567_890);
  });

  it("setAudioStreamStart does not throw for non-existent session", () => {
    expect(() => {
      manager.setAudioStreamStart("missing-session", 0);
    }).not.toThrow();
  });

  it("closeAll closes every active session", () => {
    manager.createSession("session-a");
    manager.createSession("session-b");

    manager.closeAll();

    expect(closeMock).toHaveBeenCalledTimes(2);
    expect(manager.sessionCount).toBe(0);
  });
});
