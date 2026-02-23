// Test environment setup - must be before any imports
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "error";

import { beforeEach, describe, expect, it } from "bun:test";
import {
  addSession,
  getAllSessionIds,
  getSession,
  getSessionCount,
  hasSession,
  removeSession,
  updateLastFrameTs,
} from "../src/session";

describe("Session Registry Tests", () => {
  const createMockSocket = (sessionId: string) =>
    ({
      data: {
        sessionId,
        connectedAt: Date.now(),
        lastFrameTs: Date.now(),
      },
      send: () => {
        // intentional empty - mock implementation
      },
      close: () => {
        // intentional empty - mock implementation
      },
    }) as any;

  beforeEach(() => {
    // Clear all sessions by getting all IDs and removing them
    const allIds = getAllSessionIds();
    for (const id of allIds) {
      removeSession(id);
    }
  });

  describe("addSession", () => {
    it("should add a new session to the registry", () => {
      const mockSocket = createMockSocket("session-1");
      const initialCount = getSessionCount();

      addSession("session-1", mockSocket);

      expect(getSessionCount()).toBe(initialCount + 1);
      expect(hasSession("session-1")).toBe(true);
    });

    it("should overwrite existing session with same ID", () => {
      const mockSocket1 = createMockSocket("session-2");
      const mockSocket2 = createMockSocket("session-2");

      addSession("session-2", mockSocket1);
      addSession("session-2", mockSocket2);

      const session = getSession("session-2");
      expect(session?.socket).toBe(mockSocket2);
    });
  });

  describe("removeSession", () => {
    it("should remove an existing session", () => {
      const mockSocket = createMockSocket("session-3");
      addSession("session-3", mockSocket);

      const removed = removeSession("session-3");

      expect(removed).toBeDefined();
      expect(removed?.socket).toBe(mockSocket);
      expect(hasSession("session-3")).toBe(false);
    });

    it("should return undefined for non-existent session", () => {
      const removed = removeSession("non-existent");
      expect(removed).toBeUndefined();
    });
  });

  describe("getSession", () => {
    it("should return session for existing ID", () => {
      const mockSocket = createMockSocket("session-4");
      addSession("session-4", mockSocket);

      const session = getSession("session-4");

      expect(session).toBeDefined();
      expect(session?.socket).toBe(mockSocket);
      expect(session?.connectedAt).toBeGreaterThan(0);
    });

    it("should return undefined for non-existent ID", () => {
      const session = getSession("non-existent");
      expect(session).toBeUndefined();
    });
  });

  describe("hasSession", () => {
    it("should return true for existing session", () => {
      const mockSocket = createMockSocket("session-5");
      addSession("session-5", mockSocket);

      expect(hasSession("session-5")).toBe(true);
    });

    it("should return false for non-existent session", () => {
      expect(hasSession("non-existent")).toBe(false);
    });
  });

  describe("updateLastFrameTs", () => {
    it("should update lastFrameTs for existing session", () => {
      const mockSocket = createMockSocket("session-6");
      addSession("session-6", mockSocket);

      const newTs = Date.now() + 1000;
      updateLastFrameTs("session-6", newTs);

      const session = getSession("session-6");
      expect(session?.lastFrameTs).toBe(newTs);
    });

    it("should do nothing for non-existent session", () => {
      // Should not throw
      expect(() => updateLastFrameTs("non-existent", Date.now())).not.toThrow();
    });
  });

  describe("getSessionCount", () => {
    it("should return correct count of sessions", () => {
      const initialCount = getSessionCount();

      addSession("session-7", createMockSocket("session-7"));
      addSession("session-8", createMockSocket("session-8"));

      expect(getSessionCount()).toBe(initialCount + 2);

      removeSession("session-7");

      expect(getSessionCount()).toBe(initialCount + 1);
    });
  });

  describe("getAllSessionIds", () => {
    it("should return all session IDs", () => {
      addSession("session-9", createMockSocket("session-9"));
      addSession("session-10", createMockSocket("session-10"));

      const ids = getAllSessionIds();

      expect(ids).toContain("session-9");
      expect(ids).toContain("session-10");
    });

    it("should return empty array when no sessions", () => {
      // Clear all sessions
      const ids = getAllSessionIds();
      for (const id of ids) {
        removeSession(id);
      }

      expect(getAllSessionIds()).toEqual([]);
    });
  });
});
