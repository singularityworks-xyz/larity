import { afterEach, describe, expect, it, mock } from "bun:test";

// Must mock BEFORE imports to prevent real Redis/STT module init
mock.module("@larity/infra/redis", () => ({
  redis: {
    publish: mock(() => Promise.resolve(1)),
    connect: mock(() => Promise.resolve()),
    disconnect: mock(() => undefined),
  },
  connectRedis: mock(() => Promise.resolve(true)),
}));

mock.module("@larity/stt", () => ({
  env: {
    DEEPGRAM_API_KEY: "test-key",
    REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  },
  sessionManager: {
    createSession: () => true,
    closeSession: () => Promise.resolve(),
    hasSession: () => false,
    closeAll: () => Promise.resolve(),
    sendAudio: () => Promise.resolve(),
    setAudioStreamStart: () => undefined,
  },
  validateEnv: () => undefined,
}));

import { onClose } from "../src/handlers/on-close";
import { onDrain } from "../src/handlers/on-drain";
import { onMessage } from "../src/handlers/on-message";
import { onOpen } from "../src/handlers/on-open";
import {
  __test_only_handleAlertChannel,
  __test_only_handleBroadcastSessionChannel,
} from "../src/redis/subscriber";
import {
  getAllSessionIds,
  getSession,
  getSessionCount,
  removeConnection,
} from "../src/session";

describe("WebSocket Handlers Unit Tests", () => {
  // Clean up any sessions created during tests to prevent leaks
  afterEach(() => {
    for (const sessionId of getAllSessionIds()) {
      removeConnection(sessionId, "test-user");
    }
  });
  // Create mock socket
  const createMockSocket = (sessionId: string) => {
    return {
      data: {
        sessionId,
        userId: "test-user",
        role: "host",
        connectedAt: Date.now(),
        lastFrameTs: Date.now(),
      },
      send: mock(() => {
        // intentional empty - mock implementation
      }),
      close: mock(() => {
        // intentional empty - mock implementation
      }),
    } as any;
  };

  describe("onOpen handler", () => {
    it("should register a new session", () => {
      const mockSocket = createMockSocket("test-session-1");
      const initialCount = getSessionCount();

      onOpen(mockSocket);

      expect(getSessionCount()).toBe(initialCount + 1);
      expect(getSession("test-session-1")).toBeDefined();

      // Cleanup
      removeConnection("test-session-1", "test-user");
    });

    it("should attach correct data to session", () => {
      const mockSocket = createMockSocket("test-session-2");

      onOpen(mockSocket);

      const session = getSession("test-session-2");
      expect(session).toBeDefined();
      expect(session?.connections.get("test-user")?.socket).toBe(mockSocket);
      expect(session?.lastFrameTs).toBeGreaterThan(0);

      // Cleanup
      removeConnection("test-session-2", "test-user");
    });
  });

  describe("onClose handler", () => {
    it("should remove connection on close", () => {
      const mockSocket = createMockSocket("test-session-3");
      onOpen(mockSocket);

      expect(getSession("test-session-3")).toBeDefined();

      onClose(mockSocket, 1000, "Normal closure");

      expect(getSession("test-session-3")).toBeUndefined();
    });

    it("should handle close for non-existent session gracefully", () => {
      const mockSocket = createMockSocket("non-existent-session");

      // Should not throw
      expect(() => onClose(mockSocket, 1000, "Normal closure")).not.toThrow();
    });
  });

  describe("onMessage handler", () => {
    it("should process valid VAD JSON string messages", () => {
      const mockSocket = createMockSocket("test-session-4");

      const vadPayload = JSON.stringify({
        type: "vad_speaking",
        userId: "user_123",
        sessionId: "test-session-4",
        ts: Date.now(),
      });

      // Should not throw and successfully bypass binary logic
      expect(() => onMessage(mockSocket, vadPayload)).not.toThrow();
    });

    it("should ignore improperly formatted string messages gracefully", () => {
      const mockSocket = createMockSocket("test-session-invalid");

      expect(() => onMessage(mockSocket, "invalid-json-string")).not.toThrow();
      expect(() => onMessage(mockSocket, '{"type":"unknown"}')).not.toThrow();
    });

    it("should process binary messages", () => {
      const mockSocket = createMockSocket("test-session-5");
      onOpen(mockSocket);

      const binaryData = Buffer.from([1, 2, 3, 4, 5]);

      // Should not throw
      expect(() => onMessage(mockSocket, binaryData)).not.toThrow();

      // Cleanup
      removeConnection("test-session-5", "test-user");
    });

    it("should process Uint8Array messages", () => {
      const mockSocket = createMockSocket("test-session-6");
      onOpen(mockSocket);

      const uint8Data = new Uint8Array([1, 2, 3, 4, 5]);

      // Should not throw
      expect(() => onMessage(mockSocket, uint8Data)).not.toThrow();

      // Cleanup
      removeConnection("test-session-6", "test-user");
    });
  });

  describe("onDrain handler", () => {
    it("should handle drain event without error", () => {
      const mockSocket = createMockSocket("test-session-7");

      // Should not throw
      expect(() => onDrain(mockSocket)).not.toThrow();
    });
  });

  describe("redis subscriber channel helpers", () => {
    it("identifies ledger channel as session broadcast channel", () => {
      const handled = __test_only_handleBroadcastSessionChannel(
        "meeting.ledger.session-1",
        JSON.stringify({ type: "insert" })
      );

      expect(handled).toBe(true);
    });

    it("parses alert channels without throwing", () => {
      expect(() => {
        __test_only_handleAlertChannel(
          "meeting.alert.session-1.shared",
          JSON.stringify({ id: "a1" })
        );
      }).not.toThrow();

      expect(() => {
        __test_only_handleAlertChannel(
          "meeting.alert.session-1.user.user-1",
          JSON.stringify({ id: "a2" })
        );
      }).not.toThrow();
    });
  });
});
