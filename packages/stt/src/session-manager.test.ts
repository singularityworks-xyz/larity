import { beforeEach, describe, expect, it, mock } from "bun:test";
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
    }));

    manager = new SessionManager(connectionFactory);
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

  it("closeAll closes every active session", () => {
    manager.createSession("session-a");
    manager.createSession("session-b");

    manager.closeAll();

    expect(closeMock).toHaveBeenCalledTimes(2);
    expect(manager.sessionCount).toBe(0);
  });
});
