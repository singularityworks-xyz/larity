import { redis } from "../../../../packages/infra/redis";
import { createRealtimeLogger } from "../logger";
import type {
  AudioFramePayload,
  ParticipantJoinEvent,
  ParticipantLeaveEvent,
  SessionEndEvent,
  SessionStartEvent,
} from "../types";
import {
  audioChannel,
  PARTICIPANT_JOIN,
  PARTICIPANT_LEAVE,
  SESSION_END,
  SESSION_START,
} from "./channels";

const log = createRealtimeLogger("publisher");

/**
 * Publish a raw audio frame to Redis
 * Binary-safe: encodes buffer as base64 for JSON transport
 */
export async function publishAudioFrame(
  payload: AudioFramePayload
): Promise<void> {
  const channel = audioChannel(payload.sessionId);
  try {
    // Encode buffer as base64 for JSON-safe transport
    const message = JSON.stringify({
      sessionId: payload.sessionId,
      ts: payload.ts,
      frame: payload.frame.toString("base64"),
      source: payload.source,
    });
    await redis.publish(channel, message);
  } catch (error) {
    // Drop frame, log error, continue
    log.error(
      { err: error, sessionId: payload.sessionId },
      "Failed to publish audio frame"
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
