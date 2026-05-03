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
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
  debug: (msg: string, data?: unknown) => void;
}

export function createLogger(name: string): Logger {
  const logger = root.child({ module: name });

  return {
    info: (msg: string, data?: unknown) => {
      logger.info(data ?? {}, msg);
    },
    warn: (msg: string, data?: unknown) => {
      logger.warn(data ?? {}, msg);
    },
    error: (msg: string, data?: unknown) => {
      logger.error(data ?? {}, msg);
    },
    debug: (msg: string, data?: unknown) => {
      logger.debug(data ?? {}, msg);
    },
  };
}
