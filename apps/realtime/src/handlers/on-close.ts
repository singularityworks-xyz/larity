import { redis } from "@larity/infra/redis";
import { sessionManager } from "@larity/stt";
import { closeStreamer } from "../audio/registry";
import { createRealtimeLogger } from "../logger";
import { publishParticipantLeave, publishSessionEnd } from "../redis/publisher";
import { getSession, removeConnection } from "../session";
import type { RealtimeSocket } from "../types";

const log = createRealtimeLogger("on-close");

/**
 * Handle WebSocket connection close
 *
 * @param ws - The WebSocket connection
 * @param code - Close code
 * @param message - Close reason
 */
export function onClose(
  ws: RealtimeSocket,
  code: number,
  _message: string
): void {
  const data = ws.data;
  const { sessionId, userId, role, connectedAt } = data;

  // Remove connection from memory
  // returns session if it was the last connection and session is removed
  const sessionRemoved = removeConnection(sessionId, userId, ws);

  const now = Date.now();
  const duration = now - connectedAt;

  log.info({ sessionId, userId, role, code, duration }, "Connection closed");

  // Publish participant leave event
  publishParticipantLeave({
    sessionId,
    userId,
    ts: now,
  }).catch((err) => {
    log.error(
      { err, sessionId, userId },
      "Failed to publish participant leave"
    );
  });

  // If host left or session is empty, publish session end
  const currentSession = getSession(sessionId);
  const isSessionEmpty = !!sessionRemoved;

  if (role === "host" || isSessionEmpty) {
    // closeSession internally cleans up STT connections and schedules asynchronous cleanup tasks,
    // so a direct await is unnecessary/redundant here.
    sessionManager.closeSession(sessionId);

    const sessionData = sessionRemoved || currentSession;
    const sessionDuration = sessionData ? now - sessionData.startedAt : 0;

    publishSessionEnd({
      sessionId,
      ts: now,
      duration: sessionDuration,
    }).catch((err) => {
      log.error({ err, sessionId }, "Failed to publish session end");
    });

    // Close the audio persistence streamer asynchronously
    // This completes the S3 multipart upload and writes the manifest, then triggers the transcription job
    closeStreamer(sessionId)
      .then(async (manifest) => {
        if (!manifest) {
          log.warn(
            { sessionId },
            "No audio manifest generated. Post-meeting transcription job skipped."
          );
          return;
        }
        log.info(
          { sessionId },
          "Audio persistence streamer closed. Triggering transcription job..."
        );
        try {
          const { transcribeQueue, audioCleanupQueue } = await import(
            "@larity/jobs"
          );
          const meetingId = await redis.hget(
            `meeting:session:${sessionId}`,
            "meetingId"
          );
          if (!meetingId) {
            log.error(
              { sessionId },
              "Cannot trigger transcribe job: meetingId not found in Redis"
            );
            return;
          }
          const payload = {
            sessionId,
            orgId: manifest.orgId,
            meetingId,
            s3Prefix: `${manifest.orgId}/${manifest.sessionId}`,
          };
          await transcribeQueue.add("meeting.transcribe", payload);
          log.info(
            { sessionId, meetingId },
            "Transcription job triggered successfully"
          );

          // Schedule a delayed audio cleanup job (TTL of 3 hours)
          await audioCleanupQueue.add(
            "meeting.cleanupAudio",
            {
              sessionId,
              orgId: manifest.orgId,
              s3Prefix: payload.s3Prefix,
            },
            {
              delay: 3 * 60 * 60 * 1000, // 3 hours
            }
          );
          log.info(
            { sessionId },
            "Audio cleanup job scheduled successfully (3-hour TTL)"
          );
        } catch (jobErr) {
          log.error(
            { err: jobErr, sessionId },
            "Failed to trigger post-meeting transcription job"
          );
        }
      })
      .catch((err) => {
        log.error(
          { err, sessionId },
          "Failed to close audio persistence streamer"
        );
      });
  }
}
