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
  get PORT() {
    return Number.parseInt(optional("REALTIME_PORT", "9001"), 10);
  },

  get REDIS_URL() {
    return required("REDIS_URL");
  },

  get LOG_LEVEL() {
    return optional("LOG_LEVEL", "info");
  },
};
