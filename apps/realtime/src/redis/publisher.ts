/**
 * redis/publisher.ts — Output Boundary
 *
 * The last stop inside the realtime plane.
 * Accepts payloads from handlers and publishes to Redis.
 *
 * Rules:
 * - No subscriptions
 * - No retries
 * - No buffering
 * - No transformations
 *
 * This file is the handoff point to the rest of Larity.
 * If Redis is slow, frames are dropped and logged. That's it.
 */

import { redis } from "../../../../packages/infra/redis";
import type {
  AudioFramePayload,
  SessionEndEvent,
  SessionStartEvent,
} from "../types";
import { audioChannel, SESSION_END, SESSION_START } from "./channels";

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
    });
    await redis.publish(channel, message);
  } catch (error) {
    // Drop frame, log error, continue
    console.error(
      `[publisher] Failed to publish audio frame for session ${payload.sessionId}:`,
      error
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
    console.error(
      `[publisher] Failed to publish session start for ${event.sessionId}:`,
      error
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
    console.error(
      `[publisher] Failed to publish session end for ${event.sessionId}:`,
      error
    );
  }
}
