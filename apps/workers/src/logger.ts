import { createComponentLogger, createRootLogger } from "@larity/logger";

export const rootLogger = createRootLogger({
  service: "workers",
  level: process.env.LOG_LEVEL,
});

export const createWorkerLogger = (name: string) =>
  createComponentLogger(rootLogger, name);
