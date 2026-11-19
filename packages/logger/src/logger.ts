import pino, { type LoggerOptions } from "pino";
import pretty from "pino-pretty";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  level?: string;
  service: string;
}

export function createRootLogger(options: CreateLoggerOptions) {
  const isDev = process.env.NODE_ENV !== "production";
  const logLevel =
    process.env.LOG_LEVEL || options.level || (isDev ? "debug" : "info");

  const isBun = "Bun" in globalThis;

  const pinoOptions: LoggerOptions = {
    level: logLevel,
    base: {
      service: options.service,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport:
      isDev && !isBun
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:standard",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  };

  if (isDev && isBun) {
    return pino(
      pinoOptions,
      pretty({
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      })
    );
  }

  return pino(pinoOptions);
}

import type { Logger } from "pino";
export function createComponentLogger(root: Logger, name: string): Logger {
  return root.child({ module: name });
}
