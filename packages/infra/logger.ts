import { createComponentLogger, createRootLogger } from "@larity/logger";

// Helper to get LOG_LEVEL from env (since we don't have a centralized env file in infra)
// We rely on the process.env being populated by the consuming app (dotenv)
const LOG_LEVEL = process.env.LOG_LEVEL;

export const rootLogger = createRootLogger({
  service: "infra",
  level: LOG_LEVEL,
});

export const createInfraLogger = (name: string) =>
  createComponentLogger(rootLogger, name);
