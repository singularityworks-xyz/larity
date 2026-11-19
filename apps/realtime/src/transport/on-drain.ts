import { createRealtimeLogger } from "../logger";
import type { RealtimeSocket } from "./types";

const log = createRealtimeLogger("on-drain");

export function onDrain(ws: RealtimeSocket): void {
  const data = ws.data;
  const { sessionId } = data;

  log.warn({ sessionId }, "Backpressure relieved");
}
