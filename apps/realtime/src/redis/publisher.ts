import { redis } from "@larity/infra/redis";
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
  SESSION_END,
  SESSION_START,
  vadChannel,
} from "./channels";

const log = createRealtimeLogger("publisher");

/**
 * Publish a VAD signal to Redis
 */
export async function publishVadSignal(payload: VadSignal): Promise<void> {
  const channel = vadChannel(payload.sessionId);
  try {
    const message = JSON.stringify(payload);
    await redis.publish(channel, message);
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
    await redis.publish(SESSION_START, JSON.stringify(event));
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
    await redis.publish(SESSION_END, JSON.stringify(event));
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
    await redis.publish(PARTICIPANT_JOIN, JSON.stringify(event));
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
    await redis.publish(PARTICIPANT_LEAVE, JSON.stringify(event));
  } catch (error) {
    log.error(
      { err: error, sessionId: event.sessionId },
      "Failed to publish participant leave"
    );
  }
}
