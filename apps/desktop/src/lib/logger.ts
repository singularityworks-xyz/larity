const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

type Level = keyof typeof LOG_LEVELS;

const currentLevel: Level =
  (import.meta.env?.VITE_LOG_LEVEL as Level) ?? "info";

function shouldLog(level: Level): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

export interface Logger {
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  debug: (msg: string, data?: unknown) => void;
}

export function createLogger(name: string): Logger {
  return {
    info: (msg: string, data?: unknown) => {
      if (shouldLog("info")) {
        console.log(`[${name}] ${msg}`, data ?? "");
      }
    },
    warn: (msg: string, data?: unknown) => {
      if (shouldLog("warn")) {
        console.warn(`[${name}] ${msg}`, data ?? "");
      }
    },
    error: (msg: string, data?: unknown) => {
      if (shouldLog("error")) {
        console.error(`[${name}] ${msg}`, data ?? "");
      }
    },
    debug: (msg: string, data?: unknown) => {
      if (shouldLog("debug")) {
        console.debug(`[${name}] ${msg}`, data ?? "");
      }
    },
  };
}
