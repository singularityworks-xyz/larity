import { Elysia, t } from "elysia";
import { env } from "./env";
import { onClose } from "./handlers/on-close";
import { onDrain } from "./handlers/on-drain";
import { onMessage } from "./handlers/on-message";
import { onOpen } from "./handlers/on-open";
import { validateSession } from "./handlers/validate-session";
import { createRealtimeLogger } from "./logger";
import { addAdminRoutes } from "./routes/admin";
import type { RealtimeSocket } from "./types";

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
      const app = new Elysia().derive(async ({ query }) => {
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

        // Payload and timeout configurations
        maxPayloadLength: WEBSOCKET_MAX_PAYLOAD_BYTES,
        idleTimeout: WEBSOCKET_IDLE_TIMEOUT_SECONDS,

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
