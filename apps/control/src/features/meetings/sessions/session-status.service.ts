import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import type {
  SessionStatus,
  SessionStatusResponse,
} from "./meeting-session.validator";
import { SESSION_TTL } from "./session-constants";

type SessionReader = Pick<typeof redis, "hgetall" | "sismember">;

export async function getSessionStatus(
  sessionId: string,
  reader: SessionReader = redis
): Promise<SessionStatusResponse | null> {
  const data = await reader.hgetall(redisKeys.meetingSession(sessionId));
  if (!(data?.sessionId && data.meetingId && data.startedAt && data.status)) {
    return null;
  }

  const startedAt = Number.parseInt(data.startedAt, 10);
  return {
    sessionId: data.sessionId,
    meetingId: data.meetingId,
    status: data.status as SessionStatus,
    startedAt,
    duration: Date.now() - startedAt,
    utteranceCount: Number.parseInt(data.utteranceCount || "0", 10),
    lastActivityAt: data.lastActivityAt
      ? Number.parseInt(data.lastActivityAt, 10)
      : undefined,
  };
}

export async function updateSessionActivity(sessionId: string): Promise<void> {
  const sessionKey = redisKeys.meetingSession(sessionId);
  const configKey = redisKeys.sessionConfig(sessionId);
  await redis.hset(sessionKey, {
    lastActivityAt: Date.now().toString(),
    status: "active",
  });
  await redis.hincrby(sessionKey, "utteranceCount", 1);
  await redis.expire(sessionKey, SESSION_TTL);
  await redis.expire(configKey, SESSION_TTL);
}

export async function isValidSession(
  sessionId: string,
  userId?: string,
  role?: "host" | "participant",
  reader: SessionReader = redis
): Promise<boolean> {
  const sessionData = await reader.hgetall(redisKeys.meetingSession(sessionId));
  if (!sessionData || Object.keys(sessionData).length === 0) {
    return false;
  }
  if (userId && role) {
    if (role === "host") {
      return sessionData.userId === userId;
    }
    if (role === "participant") {
      return (
        (await reader.sismember(
          redisKeys.sessionParticipants(sessionId),
          userId
        )) === 1
      );
    }
  }
  return false;
}
