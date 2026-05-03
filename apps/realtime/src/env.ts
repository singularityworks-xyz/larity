/**
 * env.ts — Hard Startup Gate
 *
 * Reads environment variables and validates required ones.
 * Crashes if any required variable is missing.
 *
 * Infra misconfiguration must fail immediately.
 * Silent fallbacks cause production bugs.
 */

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
  get PORT() {
    return Number.parseInt(optional("REALTIME_PORT", "9001"), 10);
  },

  /** Redis connection URL - required, comes from infra */
  get REDIS_URL() {
    return required("REDIS_URL");
  },

  /** Log level - optional, defaults to info/debug */
  get LOG_LEVEL() {
    return optional("LOG_LEVEL", "info");
  },
};
