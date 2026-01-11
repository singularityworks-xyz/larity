import { createClient, type DeepgramClient } from '@deepgram/sdk';
import { DEEPGRAM_API_KEY } from '../env';

let client: DeepgramClient | null = null;

/**
 * Get or create the Deepgram client instance
 */
export function getDeepgramClient(): DeepgramClient {
  if (!client) {
    if (!DEEPGRAM_API_KEY) {
      throw new Error('DEEPGRAM_API_KEY is not set');
    }
    client = createClient(DEEPGRAM_API_KEY);
    console.log('[DG] Deepgram client initialized');
  }
  return client;
}
