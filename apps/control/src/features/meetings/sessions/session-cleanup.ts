import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import {
  createS3Client,
  getS3Config,
  PutObjectCommand,
} from "@larity/infra/s3";
import { prisma } from "../../../lib/prisma";
import { createControlLogger } from "../../../logger";

const log = createControlLogger("meeting-session-service");

export async function scheduleCleanup(
  sessionId: string,
  meetingId: string
): Promise<void> {
  // Remove from active sessions
  await redis.srem(redisKeys.activeSessions(), sessionId);

  // Fetch orgId from DB
  let orgId: string | undefined;
  try {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        client: {
          select: {
            orgId: true,
          },
        },
      },
    });
    if (meeting?.client?.orgId) {
      orgId = meeting.client.orgId;
    }
  } catch (err) {
    log.error(
      { err, meetingId, sessionId },
      `Failed to fetch orgId from DB for meeting ${meetingId}, aborting session S3 dump`
    );
  }

  if (orgId) {
    // Dump session state to S3
    try {
      const commitmentsRaw = await redis.get(
        redisKeys.meetingCommitment(sessionId)
      );
      const finalCommitments = commitmentsRaw
        ? JSON.parse(commitmentsRaw)
        : null;

      const constraintsRaw = await redis.get(
        redisKeys.meetingConstraintLedger(sessionId)
      );
      const finalConstraints = constraintsRaw
        ? JSON.parse(constraintsRaw)
        : null;

      const speakerMap = await redis.hgetall(
        redisKeys.meetingSpeaker(sessionId)
      );

      const topicsRaw = await redis.get(redisKeys.meetingTopic(sessionId));
      const finalTopics = topicsRaw ? JSON.parse(topicsRaw) : null;

      const vadHistoryRaw = await redis.lrange(
        `meeting.vad.${sessionId}`,
        0,
        -1
      );
      const vadHistory = vadHistoryRaw.map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return item;
        }
      });

      const clockOffsets = await redis.hgetall(
        `meeting.clock_offsets.${sessionId}`
      );

      const sessionState = {
        sessionId,
        meetingId,
        orgId,
        commitments: finalCommitments,
        constraints: finalConstraints,
        speakerMap,
        topics: finalTopics,
        vadHistory,
        clockOffsets,
        timestamp: Date.now(),
      };

      const s3Client = createS3Client();
      try {
        const config = getS3Config();
        const key = `${orgId}/${sessionId}/session_state.json`;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            Body: JSON.stringify(sessionState, null, 2),
            ContentType: "application/json",
            ServerSideEncryption: "AES256",
          })
        );
      } finally {
        s3Client.destroy();
      }
    } catch (err) {
      // Fail-safe: do not crash if S3 upload fails, but log it
      log.error(
        { err, sessionId, meetingId, orgId },
        `Session cleanup S3 dump failed for session ${sessionId}`
      );
    }
  } else {
    log.warn(
      { sessionId, meetingId },
      `Aborting session S3 dump for session ${sessionId}: missing or empty orgId`
    );
  }

  // Extend TTL of specified keys to 7 days
  const keysToExtend = [
    redisKeys.meetingSession(sessionId),
    redisKeys.meetingToSession(meetingId),
    redisKeys.meetingCommitment(sessionId),
    redisKeys.meetingConstraintLedger(sessionId),
    redisKeys.meetingSpeaker(sessionId),
    redisKeys.meetingContext(sessionId),
    redisKeys.meetingTopic(sessionId),
    `meeting.topics.${sessionId}`,
    `meeting.cost.${sessionId}`,
    `meeting.clock_offsets.${sessionId}`,
    `meeting.vad.${sessionId}`,
    `meeting:ledger:${sessionId}`,
  ];

  for (const key of keysToExtend) {
    try {
      await redis.expire(key, 7 * 24 * 60 * 60); // 7 days
    } catch {
      // ignore
    }
  }
}
