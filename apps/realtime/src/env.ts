/**
 * env.ts — Hard Startup Gate
 *
 * Reads environment variables and validates required ones.
 * Crashes if any required variable is missing.
 *
 * Infra misconfiguration must fail immediately.
 * Silent fallbacks cause production bugs.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Load environment variables from project root .env file
import { config } from 'dotenv';

// Get the directory of the current file and navigate to project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../');
const envPath = join(projectRoot, '.env');

config({ path: envPath });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`FATAL: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const env = {
  /** WebSocket server port */
  PORT: parseInt(optional('REALTIME_PORT', '9001'), 10),

  /** Redis connection URL - required, comes from infra */
  REDIS_URL: required('REDIS_URL'),
} as const;
