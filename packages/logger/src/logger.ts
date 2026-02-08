import pino, { type LoggerOptions } from "pino";

export type { Logger } from "pino";

export interface CreateLoggerOptions {
  service: string;
  level?: string;
}

/**
 * Creates a root logger instance for an application or package.
 * This should be called once per application/package entry point.
 */
export function createRootLogger(options: CreateLoggerOptions) {
  const isDev = process.env.NODE_ENV !== "production";
  const logLevel =
    process.env.LOG_LEVEL || options.level || (isDev ? "debug" : "info");

  const pinoOptions: LoggerOptions = {
    level: logLevel,
    base: {
      service: options.service,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: isDev
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
