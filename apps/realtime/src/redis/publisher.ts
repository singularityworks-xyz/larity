import { redis } from "@larity/db/redis";
import { createRealtimeLogger } from "../logger";
import type {
  ParticipantJoinEvent,
  ParticipantLeaveEvent,
  SessionEndEvent,
  SessionStartEvent,
  VadSignal,
} from "../types";
import {
  PARTICIPANT_JOIN,
  PARTICIPANT_LEAVE,
  participantRoleChangeChannel,
  SESSION_END,
  SESSION_START,
  vadChannel,
} from "./channels";

const log = createRealtimeLogger("publisher");

const VAD_HISTORY_TTL_SECONDS = 2 * 60 * 60;

/** Minimal Redis surface used by VAD publish (test seam). */
export interface VadRedisMulti {
  exec(): Promise<unknown>;
  publish(channel: string, message: string): VadRedisMulti;
  rpush(key: string, message: string): VadRedisMulti;
}

export interface VadRedisClient {
  expire(key: string, seconds: number): Promise<unknown>;
  multi(): VadRedisMulti;
}

/**
 * Publish a VAD signal to Redis and append it to the history list.
 *
 * P5.4: publish+rpush go in one MULTI (was 2 serial round trips). EXPIRE
 * runs only when this push created the list (`llen === 1`) — exactly once
 * per session, with no local bookkeeping to leak. The client is injectable
 * for tests; production passes the shared singleton.
 */
export async function publishVadSignal(
  payload: VadSignal,
  client?: VadRedisClient | null
): Promise<void> {
  const channel = vadChannel(payload.sessionId);
  const vadHistoryKey = `meeting.vad.${payload.sessionId}`;
  const redisClient = client ?? redis;
  try {
    const message = JSON.stringify(payload);
    if (redisClient && typeof redisClient.multi === "function") {
      const results = (await redisClient
        .multi()
        .publish(channel, message)
        .rpush(vadHistoryKey, message)
        .exec()) as [[unknown, unknown], [unknown, number]] | undefined;
      // ioredis exec resolves [[err, pubRes], [err, listLen]].
      const listLen = results?.[1]?.[1];
      if (listLen === 1 && typeof redisClient.expire === "function") {
        await redisClient.expire(vadHistoryKey, VAD_HISTORY_TTL_SECONDS);
      }
      return;
    }
    // Serial fallback for clients without MULTI (preserves the old guards).
    const legacy = redisClient as unknown as {
      expire?: (key: string, seconds: number) => Promise<unknown>;
      publish?: (channel: string, message: string) => Promise<unknown>;
      rpush?: (key: string, message: string) => Promise<unknown>;
    };
    if (legacy && typeof legacy.publish === "function") {
      await legacy.publish(channel, message);
    }
    if (legacy && typeof legacy.rpush === "function") {
      await legacy.rpush(vadHistoryKey, message);
    }
    if (legacy && typeof legacy.expire === "function") {
      await legacy.expire(vadHistoryKey, VAD_HISTORY_TTL_SECONDS);
    }
  } catch (error) {
    log.error(
      { err: error, sessionId: payload.sessionId, userId: payload.userId },
      "Failed to publish VAD signal"
    );
  }
}

/**
 * Publish session start event
 */
export async function publishSessionStart(
  event: SessionStartEvent
): Promise<void> {
  try {
    if (redis && typeof redis.publish === "function") {
      await redis.publish(SESSION_START, JSON.stringify(event));
    }
  } catch (error) {
    log.error(
      { err: error, sessionId: event.sessionId },
      "Failed to publish session start"
    );
  }
}

/**
 * Publish session end event
 */
export async function publishSessionEnd(event: SessionEndEvent): Promise<void> {
  try {
    if (redis && typeof redis.publish === "function") {
      await redis.publish(SESSION_END, JSON.stringify(event));
    }
  } catch (error) {
    log.error(
      { err: error, sessionId: event.sessionId },
      "Failed to publish session end"
    );
  }
}

/**
 * Publish participant join event
 */
export async function publishParticipantJoin(
  event: ParticipantJoinEvent
): Promise<void> {
  try {
    if (redis && typeof redis.publish === "function") {
      await redis.publish(PARTICIPANT_JOIN, JSON.stringify(event));
    }
  } catch (error) {
    log.error(
      { err: error, sessionId: event.sessionId },
      "Failed to publish participant join"
    );
  }
}

/**
 * Publish participant leave event
 */
export async function publishParticipantLeave(
  event: ParticipantLeaveEvent
): Promise<void> {
  try {
    if (redis && typeof redis.publish === "function") {
      await redis.publish(PARTICIPANT_LEAVE, JSON.stringify(event));
    }
  } catch (error) {
    log.error(
      { err: error, sessionId: event.sessionId },
      "Failed to publish participant leave"
    );
  }
}

/**
 * Publish participant role change event
 */
export async function publishParticipantRoleChange(
  sessionId: string,
  event: { speakerId: string; role: "TEAM" | "EXTERNAL" }
): Promise<void> {
  try {
    const channel = participantRoleChangeChannel(sessionId);
    if (redis && typeof redis.publish === "function") {
      await redis.publish(channel, JSON.stringify(event));
    }
  } catch (error) {
    log.error(
      { err: error, sessionId },
      "Failed to publish participant role change"
    );
  }
}
