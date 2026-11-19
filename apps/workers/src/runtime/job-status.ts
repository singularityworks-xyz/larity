import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";

export type JobStep = "transcribe" | "summary";
export type JobStatus = "queued" | "processing" | "done" | "failed";

const STATUS_TTL_SECONDS = 24 * 60 * 60;

export async function setJobStatus(
  sessionId: string,
  step: JobStep,
  status: JobStatus
): Promise<void> {
  const key = redisKeys.meetingJobStatus(sessionId, step);
  await redis.set(key, status, "EX", STATUS_TTL_SECONDS);
}

export async function publishMeetingProcessed(
  meetingId: string,
  sessionId: string
): Promise<void> {
  const channel = redisKeys.meetingProcessingComplete(sessionId);
  const payload = JSON.stringify({
    meetingId,
    sessionId,
    status: "complete",
    type: "meeting_processed",
  });
  await redis.publish(channel, payload);
}

export async function cleanupMeetingStateKeys(
  meetingId: string,
  sessionId: string
): Promise<void> {
  const keysToDel = [
    redisKeys.meetingSession(sessionId),
    redisKeys.meetingToSession(meetingId),
    redisKeys.sessionParticipants(sessionId),
    redisKeys.meetingCommitment(sessionId),
    redisKeys.meetingLedgerSnapshot(sessionId),
    redisKeys.meetingConstraintLedger(sessionId),
    redisKeys.meetingContext(sessionId),
    redisKeys.meetingSpeaker(sessionId),
    redisKeys.meetingUtterance(sessionId),
    redisKeys.meetingTopic(sessionId),
    redisKeys.sessionConfig(sessionId),
    redisKeys.meetingSessionState(sessionId),
    redisKeys.stt(sessionId),
    redisKeys.intent(sessionId),
  ];

  await Promise.all([
    redis.del(...keysToDel),
    redis.srem(redisKeys.activeSessions(), sessionId),
  ]);
}
