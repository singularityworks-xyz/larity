import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SessionManager } from "./session-manager";

describe("SessionManager.connectSession", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("eagerly dials the session connection when supported", () => {
    const preconnect = mock(() => undefined);
    const sendAudio = mock(() => undefined);
    const manager = new SessionManager(() => ({
      close: () => undefined,
      preconnect,
      sendAudio,
      setAudioStreamStart: () => undefined,
    }));

    expect(manager.createSession("s1")).toBe(true);
    expect(preconnect).not.toHaveBeenCalled();
    manager.connectSession("s1");
    expect(preconnect).toHaveBeenCalledTimes(1);
    // P4.10: the send chain is synchronous — no promise involved.
    manager.sendAudio("s1", Buffer.alloc(1024));
    expect(sendAudio).toHaveBeenCalledTimes(1);
  });

  test("missing sessions and legacy connections are no-ops", () => {
    const manager = new SessionManager(() => ({
      close: () => undefined,
      sendAudio: () => undefined,
      setAudioStreamStart: () => undefined,
    }));

    expect(() => manager.connectSession("nope")).not.toThrow();
    expect(manager.createSession("s1")).toBe(true);
    expect(() => manager.connectSession("s1")).not.toThrow();
  });
});
