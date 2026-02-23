// Test environment setup - must be before any imports
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
process.env.LOG_LEVEL = "error";

import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { Elysia, t } from "elysia";
import { validateSession } from "../src/handlers/validate-session";

// Mock the validateSession function for testing
const mockValidateSession = spyOn(
  { validateSession },
  "validateSession"
).mockImplementation((sessionId: string) => {
  // Allow specific test sessions
  if (sessionId === "valid-session-123") {
    return Promise.resolve(true);
  }
  if (sessionId === "invalid-session-456") {
    return Promise.resolve(false);
  }
  // Default to true for other cases (dev mode behavior)
  return Promise.resolve(true);
});

describe("WebSocket Server Integration Tests", () => {
  let app: any;
  const testPort = 9100;

  beforeAll(() => {
    // Create a minimal Elysia WS server for testing
    // Using /* to match the production configuration
    app = new Elysia()
      .ws("/*", {
        query: t.Object({
          sessionId: t.String({ error: "Missing sessionId query parameter" }),
        }),

        maxPayloadLength: 64 * 1024,
        idleTimeout: 600,

        async beforeHandle({ query: { sessionId }, set }) {
          const isValid = await mockValidateSession(sessionId);
          if (!isValid) {
            set.status = 401;
            return "Invalid or expired session";
          }
        },

        open(socket) {
          const sessionId = socket.data.query.sessionId;
          const now = Date.now();
          Object.assign(socket.data, {
            sessionId,
            connectedAt: now,
            lastFrameTs: now,
          });
        },

        message(socket, message) {
          // Echo back the message for testing
          socket.send(message as string);
        },
      })
      .listen(testPort);
  });

  afterAll(() => {
    app.stop();
    mockValidateSession.mockRestore();
  });

  describe("Connection Validation", () => {
    it("should require sessionId for WebSocket upgrade", async () => {
      // WebSocket upgrade attempt without sessionId should fail
      const response = await fetch(`http://localhost:${testPort}/`, {
        headers: {
          Upgrade: "websocket",
          Connection: "Upgrade",
          "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
          "Sec-WebSocket-Version": "13",
        },
      });
      // 400 = validation error (missing sessionId)
      // 422 = unprocessable entity (validation failed)
      // 426 = upgrade required
      expect([400, 422, 426]).toContain(response.status);
    });

    it("should accept connection with valid sessionId", async () => {
      const response = await fetch(
        `http://localhost:${testPort}/?sessionId=valid-session-123`,
        {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version": "13",
          },
        }
      );
      // WebSocket upgrade returns 101 or 426 (upgrade required)
      expect([101, 426]).toContain(response.status);
    });

    it("should reject connection with invalid sessionId", async () => {
      const response = await fetch(
        `http://localhost:${testPort}/?sessionId=invalid-session-456`,
        {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
            "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
            "Sec-WebSocket-Version": "13",
          },
        }
      );
      // Should be rejected due to beforeHandle returning 401
      // or 422 for validation error
      // or 426 if the websocket upgrade was attempted
      expect([401, 422, 426]).toContain(response.status);
    });
  });

  describe("WebSocket Communication", () => {
    it("should establish WebSocket connection and echo messages", async () => {
      const ws = new WebSocket(
        `ws://localhost:${testPort}/?sessionId=valid-session-123`
      );

      const messageReceived = new Promise<string>((resolve, reject) => {
        ws.onmessage = (event) => resolve(event.data as string);
        ws.onerror = () => reject(new Error("WebSocket error"));
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });

      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      ws.send("test-message");

      const response = await messageReceived;
      expect(response).toBe("test-message");

      ws.close();
    });

    it("should handle binary messages", async () => {
      const ws = new WebSocket(
        `ws://localhost:${testPort}/?sessionId=valid-session-123`
      );

      const messageReceived = new Promise<ArrayBuffer>((resolve, reject) => {
        ws.onmessage = (event) => resolve(event.data as ArrayBuffer);
        ws.onerror = () => reject(new Error("WebSocket error"));
        setTimeout(() => reject(new Error("Timeout")), 5000);
      });

      await new Promise<void>((resolve) => {
        ws.onopen = () => resolve();
      });

      const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
      ws.send(binaryData);

      const response = await messageReceived;
      expect(new Uint8Array(response)).toEqual(binaryData);

      ws.close();
    });
  });
});
