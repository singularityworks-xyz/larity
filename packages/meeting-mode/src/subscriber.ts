import Redis from 'ioredis';
import type { SessionEndEvent, SttResult } from '../../stt/src/types';
import { SESSION_END, STT_FINAL_PATTERN } from './channels';
import { REDIS_URL } from './env';
import type { UtteranceFinalizer } from './utterance/finalizer';

let subscriber: Redis | null = null;

let finalizerRef: UtteranceFinalizer | null = null;

async function handleSttResult(channel: string, message: string): Promise<void> {
  try {
    // Parse the JSON message
    const result = JSON.parse(message) as SttResult;

    // Validate we have a finalizer
    if (!finalizerRef) {
      console.error('[Subscriber] No finalizer registered!');
      return;
    }

    // Route to finalizer for processing
    await finalizerRef.process(result);
  } catch (error) {
    console.error(`[Subscriber] Error handling STT result on ${channel}:`, error);
  }
}

async function handleSessionEnd(message: string): Promise<void> {
  try {
    const event = JSON.parse(message) as SessionEndEvent;

    if (!finalizerRef) {
      console.error('[Subscriber] No finalizer registered!');
      return;
    }

    await finalizerRef.closeSession(event.sessionId);
  } catch (error) {
    console.error(`[Subscriber] Error handling session end:`, error);
  }
}

export async function startSubscriber(finalizer: UtteranceFinalizer): Promise<void> {
  finalizerRef = finalizer;

  subscriber = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    showFriendlyErrorStack: true,
  });

  await subscriber.connect();
  console.log('[Subscriber] Connected to Redis');

  await subscriber.subscribe(SESSION_END);
  console.log(`[Subscriber] Subscribed to ${SESSION_END}`);

  await subscriber.psubscribe(STT_FINAL_PATTERN);
  console.log(`[Subscriber] Pattern subscribed to ${STT_FINAL_PATTERN}`);

  subscriber.on('message', async (channel: string, message: string) => {
    if (channel === SESSION_END) {
      await handleSessionEnd(message);
    }
  });

  subscriber.on('pmessage', async (_pattern: string, channel: string, message: string) => {
    try {
      if (_pattern === STT_FINAL_PATTERN) {
        await handleSttResult(channel, message);
      }
    } catch (error) {
      console.error(`[Subscriber] Error handling message on pattern ${_pattern}:`, error);
    }
  });

  subscriber.on('error', (error) => {
    console.error('[Subscriber] Redis error:', error);
  });

  subscriber.on('reconnecting', () => {
    console.log('[Subscriber] Reconnecting to Redis...');
  });
}

export async function stopSubscriber(): Promise<void> {
  if (subscriber) {
    console.log('[Subscriber] Stopping...');
    subscriber.disconnect();
    subscriber = null;
    finalizerRef = null;
    console.log('[Subscriber] Disconnected');
  }
}
