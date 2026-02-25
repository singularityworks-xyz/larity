import { describe, expect, it, mock } from "bun:test";
import { publishAudioFrame } from "../redis/publisher";
import type { RealtimeSocket } from "../types";
import { onMessage } from "./on-message";

// Mock dependencies
mock.module("../redis/publisher", () => ({
  publishAudioFrame: mock(() => Promise.resolve()),
}));

mock.module("../session", () => ({
  updateLastFrameTs: mock(),
}));

describe("Realtime Handlers", () => {
  const sessionId = "session-123";

  // Mock socket factory
  const createMockSocket = (role: "host" | "participant") => {
    return {
      data: {
        sessionId,
        role,
        userId: "user-1",
        connectedAt: Date.now(),
        lastFrameTs: Date.now(),
      },
      send: mock(),
      close: mock(),
    } as unknown as RealtimeSocket;
  };

  describe("onMessage (Audio Frames)", () => {
    it("should process audio frames from HOST", () => {
      const socket = createMockSocket("host");
      const audioData = Buffer.from("fake-audio");

      onMessage(socket, audioData);

      expect(publishAudioFrame).toHaveBeenCalled();
      const calls = (publishAudioFrame as any).mock.calls;
      const payload = calls[0][0];

      expect(payload.sessionId).toBe(sessionId);
      expect(payload.frame).toEqual(audioData);
    });

    it("should IGNORE audio frames from PARTICIPANT", () => {
      // Clear previous calls
      (publishAudioFrame as any).mockClear();

      const socket = createMockSocket("participant");
      const audioData = Buffer.from("fake-audio");

      onMessage(socket, audioData);

      expect(publishAudioFrame).not.toHaveBeenCalled();
    });

    it("should ignore non-binary messages", () => {
      (publishAudioFrame as any).mockClear();

      const socket = createMockSocket("host");
      const textMessage = "hello world";

      onMessage(socket, textMessage);

      expect(publishAudioFrame).not.toHaveBeenCalled();
    });
  });
});
