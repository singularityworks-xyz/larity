import { redis } from "@larity/infra/redis";
import { redisKeys } from "@larity/infra/redis/keys";

export type JobStep = "transcribe" | "summary";
export type JobStatus = "queued" | "processing" | "done" | "failed";

const STATUS_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Sets the job status in Redis for a given meeting session and pipeline step.
 */
export async function setJobStatus(
  sessionId: string,
  step: JobStep,
  status: JobStatus
): Promise<void> {
  const key = redisKeys.meetingJobStatus(sessionId, step);
  await redis.set(key, status, "EX", STATUS_TTL_SECONDS);
}

/**
 * Publishes the meeting.processed event to Redis Pub/Sub.
 */
export async function publishMeetingProcessed(
  meetingId: string,
  sessionId: string
): Promise<void> {
  const channel = redisKeys.meetingProcessingComplete(sessionId);
  const payload = JSON.stringify({
    meetingId,
    sessionId,
    status: "complete",
  });
  await redis.publish(channel, payload);
}

/**
 * Cleans up temporary in-memory meeting state keys in Redis after successful persistence.
 * Note: We do NOT delete the job status keys here, as they need to remain readable
 * for checking the processing status of the meeting post-persistence. They will expire naturally.
 */
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

  // Pipeline execution cleanup
  await Promise.all([
    redis.del(...keysToDel),
    redis.srem(redisKeys.activeSessions(), sessionId),
  ]);
}
