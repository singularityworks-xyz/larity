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

const WEBSOCKET_MAX_PAYLOAD_BYTES = 64 * 1024;
const WEBSOCKET_IDLE_TIMEOUT_SECONDS = 600;

// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
export function startServer(): Promise<any> {
  return new Promise((resolve, reject) => {
    try {
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
        query: t.Object({
          sessionId: t.String({ error: "Missing sessionId query parameter" }),
          userId: t.String({ error: "Missing userId query parameter" }),
          role: t.Union([t.Literal("host"), t.Literal("participant")], {
            error: "Role must be 'host' or 'participant'",
          }),
          name: t.Optional(t.String()),
        }),

        beforeHandle({ sessionValidation, set }) {
          if (!sessionValidation.isValid) {
            set.status = 401;
            return "Invalid or expired session";
          }
        },

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

        message(socket, message) {
          onMessage(
            socket as unknown as RealtimeSocket,
            message as string | Buffer | Uint8Array
          );
        },

        drain(socket) {
          onDrain(socket as unknown as RealtimeSocket);
        },

        close(socket, code, message) {
          onClose(socket as unknown as RealtimeSocket, code, message);
        },
      });

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

// biome-ignore lint/suspicious/noExplicitAny: complex Elysia type
export function stopServer(app: any): void {
  app.stop();
  log.info("WebSocket server stopped");
}
