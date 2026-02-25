import { opentelemetry } from "@elysiajs/opentelemetry";
import { Elysia, t } from "elysia";
import { env } from "./env";
import { onClose } from "./handlers/on-close";
import { onDrain } from "./handlers/on-drain";
import { onMessage } from "./handlers/on-message";
import { onOpen } from "./handlers/on-open";
import { validateSession } from "./handlers/validate-session";
import { createRealtimeLogger } from "./logger";
import type { RealtimeSocket } from "./types";

const log = createRealtimeLogger("server");

/**
 * Start the WebSocket server
 * Returns a promise that resolves when the server is listening
 */
// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
export function startServer(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
      const app = new Elysia()
        .use(opentelemetry({ serviceName: "realtime" }))
        .ws("/*", {
          // Schema validation for the connection URL query parameters
          query: t.Object({
            sessionId: t.String({ error: "Missing sessionId query parameter" }),
            userId: t.String({ error: "Missing userId query parameter" }),
            role: t.Union([t.Literal("host"), t.Literal("participant")], {
              error: "Role must be 'host' or 'participant'",
            }),
          }),

          // Payload and timeout configurations
          maxPayloadLength: 64 * 1024,
          idleTimeout: 600,

          /**
           * Runs before the WebSocket connection is established.
           * We validate the session with the control plane here.
           */
          async beforeHandle({ query: { sessionId, userId, role }, set }) {
            const isValid = await validateSession(sessionId, userId, role);
            if (!isValid) {
              set.status = 401;
              return "Invalid or expired session";
            }
          },

          /**
           * Called when WebSocket connection is established
           */
          open(socket) {
            // Attach our custom SocketData to the Elysia WS context
            const { sessionId, userId, role } = socket.data.query;
            const now = Date.now();

            // We use Object.assign to attach our properties to socket.data
            // so it implements our SocketData interface expected by handlers
            Object.assign(socket.data, {
              sessionId,
              userId,
              role,
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
