/**
 * server.ts — WebSocket Runtime
 *
 * The heart of the realtime plane.
 * Creates the uWebSockets app and defines WebSocket behavior.
 *
 * Core responsibilities:
 * - Create a uWebSockets App
 * - Define WebSocket behavior
 * - Bind to a port
 *
 * This file wires lifecycle hooks but contains no business logic itself.
 */

import uWS from "uWebSockets.js";
import { env } from "./env";
import { onClose } from "./handlers/on-close";
import { onDrain } from "./handlers/on-drain";
import { onMessage } from "./handlers/on-message";
import { onOpen } from "./handlers/on-open";
import type { SocketData } from "./types";

/**
 * Start the WebSocket server
 * Returns a promise that resolves when the server is listening
 */
export function startServer(): Promise<uWS.us_listen_socket> {
  return new Promise((resolve, reject) => {
    const app = uWS.App();

    app.ws<SocketData>("/*", {
      /**
       * Maximum payload size for a single message
       */
      maxPayloadLength: 64 * 1024,

      /**
       * How long a silent connection can stay open (seconds)
       * If no data for this long, connection is closed
       */
      idleTimeout: 600,

      compression: uWS.DISABLED,

      /**
       * Maximum backpressure before dropping messages
       * 1MB buffer limit per connection
       */
      maxBackpressure: 1024 * 1024,

      /**
       * Upgrade handler - validates session before connection
       * Runs BEFORE the WebSocket handshake completes
       */
      upgrade: (res, req, context) => {
        // Extract session ID from query string
        const query = req.getQuery();
        const params = new URLSearchParams(query);
        const sessionId = params.get("sessionId");

        // Reject if no session ID
        if (!sessionId) {
          res.writeStatus("400 Bad Request");
          res.end("Missing sessionId query parameter");
          return;
        }

        // Store session data to be attached to the WebSocket
        const userData: SocketData = {
          sessionId,
          connectedAt: Date.now(),
          lastFrameTs: Date.now(),
        };

        // Complete the upgrade
        res.upgrade(
          userData,
          req.getHeader("sec-websocket-key"),
          req.getHeader("sec-websocket-protocol"),
          req.getHeader("sec-websocket-extensions"),
          context
        );
      },

      /**
       * Called when WebSocket connection is established
       */
      open: onOpen,

      /**
       * Called for every incoming message
       * THE HOT PATH - must be fast
       */
      message: onMessage,

      /**
       * Called when send buffer is draining after being full
       * Backpressure signal
       */
      drain: onDrain,

      /**
       * Called when connection closes
       */
      close: onClose,
    });

    // Bind to port
    app.listen(env.PORT, (listenSocket) => {
      if (listenSocket) {
        console.log(`[server] WebSocket server listening on port ${env.PORT}`);
        resolve(listenSocket);
      } else {
        reject(new Error(`Failed to bind to port ${env.PORT}`));
      }
    });
  });
}

/**
 * Graceful shutdown helper
 */
export function stopServer(listenSocket: uWS.us_listen_socket): void {
  uWS.us_listen_socket_close(listenSocket);
  console.log("[server] WebSocket server stopped");
}
