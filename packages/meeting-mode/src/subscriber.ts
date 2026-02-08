import Redis from "ioredis";
import type { SessionEndEvent, SttResult } from "../../stt/src/types";
import { SESSION_END, STT_FINAL_PATTERN } from "./channels";
import { REDIS_URL } from "./env";
import { createMeetingModeLogger } from "./logger";
import type { UtteranceFinalizer } from "./utterance/finalizer";

const log = createMeetingModeLogger("subscriber");

let subscriber: Redis | null = null;
let finalizerRef: UtteranceFinalizer | null = null;

async function handleSttResult(
  channel: string,
  message: string
): Promise<void> {
  try {
    const result = JSON.parse(message) as SttResult;

    if (!finalizerRef) {
      log.error("No finalizer registered!");
      return;
    }

    await finalizerRef.process(result);
  } catch (error) {
    log.error({ err: error, channel }, "Error handling STT result");
  }
}

async function handleSessionEnd(message: string): Promise<void> {
  try {
    const event = JSON.parse(message) as SessionEndEvent;

    if (!finalizerRef) {
      log.error("No finalizer registered!");
      return;
    }

    await finalizerRef.closeSession(event.sessionId);
  } catch (error) {
    log.error({ err: error }, "Error handling session end");
  }
}

export async function startSubscriber(
  finalizer: UtteranceFinalizer
): Promise<void> {
  finalizerRef = finalizer;

  subscriber = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    showFriendlyErrorStack: true,
  });

  await subscriber.connect();
  log.info("Connected to Redis");

  await subscriber.subscribe(SESSION_END);
  log.info({ channel: SESSION_END }, "Subscribed to session end channel");

  await subscriber.psubscribe(STT_FINAL_PATTERN);
  log.info({ pattern: STT_FINAL_PATTERN }, "Pattern subscribed to STT results");

  subscriber.on("message", async (channel, message) => {
    if (channel === SESSION_END) {
      await handleSessionEnd(message);
    }
  });

  subscriber.on("pmessage", async (_pattern, channel, message) => {
    try {
      if (_pattern === STT_FINAL_PATTERN) {
        await handleSttResult(channel, message);
      }
    } catch (error) {
      log.error({ err: error, channel }, "Error handling message on pattern");
    }
  });

  subscriber.on("error", (error) => {
    log.error({ err: error }, "Redis error");
  });

  subscriber.on("reconnecting", () => {
    log.warn("Reconnecting to Redis...");
  });
}

export function stopSubscriber(): void {
  if (subscriber) {
    log.info("Stopping...");
    subscriber.disconnect();
    subscriber = null;
    finalizerRef = null;
    log.info("Disconnected");
  }
}
