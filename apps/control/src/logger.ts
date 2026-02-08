import { createComponentLogger, createRootLogger } from "@larity/logger";
import { env } from "./env";

export const rootLogger = createRootLogger({
  service: "control",
  level: env.LOG_LEVEL,
});

export const createControlLogger = (name: string) =>
  createComponentLogger(rootLogger, name);
