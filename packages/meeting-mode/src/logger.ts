import { createComponentLogger, createRootLogger } from "@larity/logger";
import { LOG_LEVEL } from "./env";

export const rootLogger = createRootLogger({
  service: "meeting-mode",
  level: LOG_LEVEL,
});

export const createMeetingModeLogger = (name: string) =>
  createComponentLogger(rootLogger, name);
