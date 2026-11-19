import { sessionManager } from "@larity/stt";
import { createStreamer } from "../audio/registry";
import {
  publishParticipantJoin,
  publishSessionStart,
} from "../events/redis/publisher";
import { subscribeSession } from "../events/redis/subscriber";
import { createRealtimeLogger } from "../logger";
import {
  addConnection,
  getSession,
  removeConnection,
} from "../sessions/session";
import type { RealtimeSocket } from "./types";

const log = createRealtimeLogger("on-open");

export function onOpen(ws: RealtimeSocket): void {
  const data = ws.data;
  const { sessionId, userId, role } = data;

  addConnection(sessionId, ws);

  const session = getSession(sessionId);
  const isFirstConnection = !!session && session.connections.size === 1;
  const shouldEnsureDeepgramSession =
    role === "host" && !sessionManager.hasSession(sessionId);

  if (shouldEnsureDeepgramSession) {
    const created = sessionManager.createSession(sessionId);
    if (!created) {
      removeConnection(sessionId, userId);
      ws.close();
      log.error(
        { sessionId, userId },
        "Rejected connection: Deepgram session capacity reached"
      );
      return;
    }

    try {
      createStreamer(sessionId, data.orgId);
      log.info(
        { sessionId, orgId: data.orgId },
        "Audio persistence streamer created"
      );
    } catch (error) {
      log.error(
        { err: error, sessionId },
        "Failed to create audio persistence streamer — continuing without persistence"
      );
    }

    // Dial Deepgram now so the handshake overlaps the client's first audio
    // instead of serializing after it (lazy connect stays as the fallback).
    sessionManager.connectSession(sessionId);
  }

  subscribeSession(sessionId).catch((error) => {
    log.error({ err: error, sessionId }, "Failed to subscribe session");
  });

  log.info({ sessionId, userId, role }, "Connection established");

  if (isFirstConnection) {
    publishSessionStart({
      sessionId,
      ts: data.connectedAt,
    }).catch((err) => {
      log.error({ err, sessionId }, "Failed to publish session start");
    });
  }

  publishParticipantJoin({
    sessionId,
    userId,
    name: data.name,
    role,
    ts: data.connectedAt,
  }).catch((err) => {
    log.error({ err, sessionId, userId }, "Failed to publish participant join");
  });
}
