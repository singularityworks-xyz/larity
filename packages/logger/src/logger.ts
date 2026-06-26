import pino, { type LoggerOptions } from "pino";
import pretty from "pino-pretty";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  level?: string;
  service: string;
}

/**
 * Creates a root logger instance for an application or package.
 * This should be called once per application/package entry point.
 */
export function createRootLogger(options: CreateLoggerOptions) {
  const isDev = process.env.NODE_ENV !== "production";
  const logLevel =
    process.env.LOG_LEVEL || options.level || (isDev ? "debug" : "info");

  /** Pino threaded transport breaks under Bun (`pino-pretty` target unresolved). */
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

/**
 * Creates a child logger with a specific component name.
 * @param root The root logger instance
 * @param name The component name (e.g. "auth-service", "redis-client")
 */
import type { Logger } from "pino";
export function createComponentLogger(root: Logger, name: string): Logger {
  return root.child({ module: name });
}
