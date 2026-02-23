import { createRealtimeLogger } from "../logger";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-drain");

/**
 * Handle backpressure warning
 *
 * This is called when the socket's send buffer is draining
 * after being full. It's a signal that the client was slow.
 */
export function onDrain(ws: RealtimeSocket): void {
  const data = ws.data;
  const { sessionId } = data;

  // Log the backpressure event for monitoring
  log.warn({ sessionId }, "Backpressure relieved");
}
