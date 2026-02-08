import { createComponentLogger, createRootLogger } from "@larity/logger";
import { env } from "./env";

export const rootLogger = createRootLogger({
  service: "realtime",
  level: env.LOG_LEVEL,
});

export const createRealtimeLogger = (name: string) =>
  createComponentLogger(rootLogger, name);
