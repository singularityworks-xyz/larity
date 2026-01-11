/**
 * env.ts — Environment Configuration
 *
 * Centralized environment variable access with defaults.
 */

import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from project root (larity/)
dotenv.config({ path: resolve(__dirname, '../../../.env') });

/**
 * Deepgram API key (required)
 */
export const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

/**
 * Redis connection URL
 */
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Maximum concurrent Deepgram connections per process
 * Deepgram has rate limits, so we cap this
 */
export const MAX_CONNECTIONS = parseInt(process.env.MAX_CONNECTIONS || '50', 10);

/**
 * Validate required environment variables
 */
export function validateEnv(): void {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('DEEPGRAM_API_KEY environment variable is required');
  }
}
