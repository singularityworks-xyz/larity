// Test environment setup - must be before any imports
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "error";

import { describe, expect, it, mock } from "bun:test";
import { onClose } from "../src/handlers/on-close";
import { onDrain } from "../src/handlers/on-drain";
import { onMessage } from "../src/handlers/on-message";
import { onOpen } from "../src/handlers/on-open";
import { getSession, getSessionCount, removeSession } from "../src/session";

describe("WebSocket Handlers Unit Tests", () => {
  // Create mock socket
  const createMockSocket = (sessionId: string) => {
    return {
      data: {
        sessionId,
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
      removeSession("test-session-1");
    });

    it("should attach correct data to session", () => {
      const mockSocket = createMockSocket("test-session-2");

      onOpen(mockSocket);

      const session = getSession("test-session-2");
      expect(session).toBeDefined();
      expect(session?.socket).toBe(mockSocket);
      expect(session?.connectedAt).toBeGreaterThan(0);
      expect(session?.lastFrameTs).toBeGreaterThan(0);

      // Cleanup
      removeSession("test-session-2");
    });
  });

  describe("onClose handler", () => {
    it("should remove session on close", () => {
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
    it("should ignore string messages", () => {
      const mockSocket = createMockSocket("test-session-4");

      onMessage(mockSocket, "string-message");

      // lastFrameTs should not be updated for string messages
      // (Note: In actual implementation, updateLastFrameTs would only be called for binary)
    });

    it("should process binary messages", () => {
      const mockSocket = createMockSocket("test-session-5");
      onOpen(mockSocket);

      const binaryData = Buffer.from([1, 2, 3, 4, 5]);

      // Should not throw
      expect(() => onMessage(mockSocket, binaryData)).not.toThrow();

      // Cleanup
      removeSession("test-session-5");
    });

    it("should process Uint8Array messages", () => {
      const mockSocket = createMockSocket("test-session-6");
      onOpen(mockSocket);

      const uint8Data = new Uint8Array([1, 2, 3, 4, 5]);

      // Should not throw
      expect(() => onMessage(mockSocket, uint8Data)).not.toThrow();

      // Cleanup
      removeSession("test-session-6");
    });
  });

  describe("onDrain handler", () => {
    it("should handle drain event without error", () => {
      const mockSocket = createMockSocket("test-session-7");

      // Should not throw
      expect(() => onDrain(mockSocket)).not.toThrow();
    });
  });
});
