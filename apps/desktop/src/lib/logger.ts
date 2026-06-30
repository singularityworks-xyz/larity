import pino from "pino";

const isDev = import.meta.env.DEV;
const level =
  (import.meta.env.VITE_LOG_LEVEL as string) || (isDev ? "debug" : "info");

const root = pino({
  level,
  browser: {
    asObject: true,
  },
});

export interface Logger {
  debug: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
}

export function createLogger(name: string): Logger {
  const logger = root.child({ module: name });

  return {
    info: (msg: string, data?: unknown) => {
      const obj = data !== null && typeof data === "object" ? data : { data };
      logger.info(obj, msg);
    },
    warn: (msg: string, data?: unknown) => {
      const obj = data !== null && typeof data === "object" ? data : { data };
      logger.warn(obj, msg);
    },
    error: (msg: string, data?: unknown) => {
      const obj = data !== null && typeof data === "object" ? data : { data };
      logger.error(obj, msg);
    },
    debug: (msg: string, data?: unknown) => {
      const obj = data !== null && typeof data === "object" ? data : { data };
      logger.debug(obj, msg);
    },
  };
}
