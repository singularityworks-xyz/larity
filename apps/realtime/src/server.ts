import { Elysia, t } from "elysia";
import { addAdminRoutes } from "./admin/admin";
import { env } from "./env";
import { createRealtimeLogger } from "./logger";
import { validateSession } from "./sessions/validate-session";
import { onClose } from "./transport/on-close";
import { onDrain } from "./transport/on-drain";
import { onMessage } from "./transport/on-message";
import { onOpen } from "./transport/on-open";
import type { RealtimeSocket } from "./transport/types";

const log = createRealtimeLogger("server");

// WebSocket configuration constants
/** Maximum payload length in bytes (64 KB) */
const WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;
/** Idle timeout in seconds (10 minutes) */
const WEBSOCKET_IDLE_TIMEOUT_SECONDS = 600;

/**
 * Start the WebSocket server
 * Returns a promise that resolves when the server is listening
 */
// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
export function startServer(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      // NOTE: Bun/Elysia only applies `maxPayloadLength`/`idleTimeout` from
      // the constructor-level `websocket` options — the same keys on the
      // `app.ws()` route are silently ignored (verified by probe: a 100 KB
      // frame stays open with route-level options, closes with these).
      const app = new Elysia({
        websocket: {
          maxPayloadLength: WEBSOCKET_MAX_PAYLOAD_BYTES,
          idleTimeout: WEBSOCKET_IDLE_TIMEOUT_SECONDS,
        },
      }).derive(async ({ query }) => {
        const sessionId = query?.sessionId;
        if (sessionId) {
          const validation = await validateSession(
            sessionId,
            query.userId,
            query.role
          );
          return { sessionValidation: validation };
        }
        return { sessionValidation: { isValid: false } };
      });

      // biome-ignore lint/suspicious/noExplicitAny: complex Elysia generic types
      addAdminRoutes(app as any);

      app.ws("/*", {
        // Schema validation for the connection URL query parameters
        query: t.Object({
          sessionId: t.String({ error: "Missing sessionId query parameter" }),
          userId: t.String({ error: "Missing userId query parameter" }),
          role: t.Union([t.Literal("host"), t.Literal("participant")], {
            error: "Role must be 'host' or 'participant'",
          }),
          name: t.Optional(t.String()),
        }),

        // NOTE: `maxPayloadLength`/`idleTimeout` intentionally absent here —
        // they are only honored via the constructor `websocket` options above.

        /**
         * Runs before the WebSocket connection is established.
         * We validate the session with the control plane here.
         */
        beforeHandle({ sessionValidation, set }) {
          if (!sessionValidation.isValid) {
            set.status = 401;
            return "Invalid or expired session";
          }
        },

        /**
         * Called when WebSocket connection is established
         */
        open(socket) {
          const { sessionId, userId, role, name } = socket.data.query;
          const orgId =
            ("orgId" in socket.data.sessionValidation &&
              socket.data.sessionValidation.orgId) ||
            "default";
          const now = Date.now();

          Object.assign(socket.data, {
            sessionId,
            userId,
            name: name ?? "",
            role,
            orgId,
            connectedAt: now,
            lastFrameTs: now,
          });

          onOpen(socket as unknown as RealtimeSocket);
        },

        /**
         * Called for every incoming message
         */
        message(socket, message) {
          onMessage(
            socket as unknown as RealtimeSocket,
            message as string | Buffer | Uint8Array
          );
        },

        /**
         * Called when send buffer is draining after being full
         */
        drain(socket) {
          onDrain(socket as unknown as RealtimeSocket);
        },

        /**
         * Called when connection closes
         */
        close(socket, code, message) {
          onClose(socket as unknown as RealtimeSocket, code, message);
        },
      });

      // Bind to port
      app.listen(env.PORT, (server) => {
        if (server) {
          log.info({ port: env.PORT }, "WebSocket server listening");
          resolve(app);
        } else {
          reject(new Error(`Failed to bind to port ${env.PORT}`));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Graceful shutdown helper
 */
// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
export function stopServer(app: any): void {
  app.stop();
  log.info("WebSocket server stopped");
}
