/**
 * subscriber.ts — Redis Subscriber
 *
 * Subscribes to realtime plane events and routes them to the session manager.
 * Uses a dedicated Redis client for subscriptions (ioredis requirement).
 */

import Redis from "ioredis";
import { AUDIO_PATTERN, SESSION_END, SESSION_START } from "./channels";
import { REDIS_URL } from "./env";
import { sessionManager } from "./session-manager";
import type { AudioPayload, SessionEndEvent, SessionStartEvent } from "./types";

let subscriber: Redis | null = null;

/**
 * Handle incoming audio frame
 *
 * In the host model, audio source distinction is no longer needed.
 * All audio comes from the host's system capture and speaker
 * differentiation is handled by Deepgram diarization.
 */
function handleAudioFrame(sessionId: string, payload: AudioPayload): void {
  // Decode base64 → Buffer
  const audioBuffer = Buffer.from(payload.frame, "base64");

  sessionManager.sendAudio(sessionId, audioBuffer);
}

/**
 * Handle session start event
 */
async function handleSessionStart(event: SessionStartEvent): Promise<void> {
  console.log(`[Subscriber] Session start: ${event.sessionId}`);
  await sessionManager.createSession(event.sessionId);
}

/**
 * Handle session end event
 */
async function handleSessionEnd(event: SessionEndEvent): Promise<void> {
  console.log(
    `[Subscriber] Session end: ${event.sessionId} (duration: ${event.duration}ms)`
  );
  await sessionManager.closeSession(event.sessionId);
}

/**
 * Start the Redis subscriber
 */
export async function startSubscriber(): Promise<void> {
  // Create a dedicated subscriber client
  subscriber = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    showFriendlyErrorStack: true,
  });

  await subscriber.connect();
  console.log("[Subscriber] Connected to Redis");

  // Subscribe to exact channels
  await subscriber.subscribe(SESSION_START, SESSION_END);
  console.log(`[Subscriber] Subscribed to ${SESSION_START}, ${SESSION_END}`);

  // Pattern subscribe for audio channels
  await subscriber.psubscribe(AUDIO_PATTERN);
  console.log(`[Subscriber] Pattern subscribed to ${AUDIO_PATTERN}`);

  // Handle exact channel messages
  subscriber.on("message", async (channel: string, message: string) => {
    try {
      if (channel === SESSION_START) {
        await handleSessionStart(JSON.parse(message) as SessionStartEvent);
      } else if (channel === SESSION_END) {
        await handleSessionEnd(JSON.parse(message) as SessionEndEvent);
      }
    } catch (error) {
      console.error(
        `[Subscriber] Error processing message on ${channel}:`,
        error
      );
    }
  });

  // Handle pattern-matched messages (audio frames)
  subscriber.on(
    "pmessage",
    (_pattern: string, channel: string, message: string) => {
      try {
        // Extract sessionId from channel: "realtime.audio.abc123" → "abc123"
        const sessionId = channel.split(".").pop();
        if (!sessionId) {
          console.error(
            `[Subscriber] Could not extract sessionId from channel: ${channel}`
          );
          return;
        }

        const payload = JSON.parse(message) as AudioPayload;
        handleAudioFrame(sessionId, payload);
      } catch (error) {
        console.error(
          `[Subscriber] Error processing audio frame on ${channel}:`,
          error
        );
      }
    }
  );

  // Handle subscriber errors
  subscriber.on("error", (error) => {
    console.error("[Subscriber] Redis error:", error);
  });
}

/**
 * Stop the Redis subscriber
 */
export async function stopSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
    console.log("[Subscriber] Disconnected from Redis");
  }
}
