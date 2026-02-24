import { cors } from "@elysiajs/cors";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { Elysia } from "elysia";
import { env } from "./env";
import { createControlLogger } from "./logger";
import { requireAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import {
  authRoutes,
  clientsRoutes,
  decisionsRoutes,
  documentsRoutes,
  importantPointsRoutes,
  meetingSessionRoutes,
  meetingsRoutes,
  openQuestionsRoutes,
  orgsRoutes,
  policyGuardrailsRoutes,
  remindersRoutes,
  tasksRoutes,
  usersRoutes,
} from "./routes";

const log = createControlLogger("server");

export const app = new Elysia()
  // Request logging/tracing
  .use(
    opentelemetry({
      serviceName: "control",
    })
  )
  .use(requestLogger)
  // CORS
  .use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    })
  )
  // Global error handler
  .onError(({ code, error, set }) => {
    log.error({ code, err: error }, "Global error handler");

    if (code === "VALIDATION") {
      set.status = 400;
      return {
        success: false,
        error: "Validation Error",
        message: error.message,
      };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return {
        success: false,
        error: "Not Found",
        message: "Resource not found",
      };
    }

    set.status = 500;
    return {
      success: false,
      error: "Internal Server Error",
      message: (error as Error).message,
    };
  })
  // Health check
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  // Auth routes
  .use(authRoutes)
  // Protected API routes
  .group("/api", (app) =>
    app
      .use(requireAuth)
      // Core identity
      .use(orgsRoutes)
      .use(clientsRoutes)
      .use(usersRoutes)
      // Meeting domain
      .use(meetingsRoutes)
      // Decisions & tasks
      .use(tasksRoutes)
      .use(decisionsRoutes)
      .use(openQuestionsRoutes)
      .use(importantPointsRoutes)
      // Policy & compliance
      .use(policyGuardrailsRoutes)
      // Documents & reminders
      .use(documentsRoutes)
      .use(remindersRoutes)
      .use(meetingSessionRoutes)
  );

export type App = typeof app;
