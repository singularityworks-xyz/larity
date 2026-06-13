import { cors } from "@elysiajs/cors";
import { cron } from "@elysiajs/cron";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { Prisma } from "@larity/infra/prisma/generated/prisma/client";
import { preMeetingBriefQueue } from "@larity/jobs";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";
import { getMetricsText, startDefaultMetrics } from "meeting-mode";
import { env } from "./env";
import { prisma } from "./lib/prisma";
import { createControlLogger } from "./logger";
import { requireAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import {
  authRoutes,
  clientsRoutes,
  decisionsRoutes,
  documentsRoutes,
  homeRoutes,
  importantPointsRoutes,
  internalSessionRoutes,
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

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4317",
});

startDefaultMetrics();

export const app = new Elysia()
  // Request logging/tracing
  .use(
    opentelemetry({
      serviceName: "control",
      spanProcessors: [new BatchSpanProcessor(traceExporter)],
    })
  )
  .use(requestLogger)
  // CORS
  .use(
    cors({
      origin: env.FRONTEND_ORIGINS,
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
  // Prometheus metrics
  .get("/metrics", async () => {
    const metrics = await getMetricsText();
    return new Response(metrics, {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  })
  // Cron jobs
  .use(
    cron({
      name: "pre-meeting-brief-generator",
      pattern: "0 * * * *", // Every hour
      async run() {
        log.info("Running pre-meeting brief cron...");
        const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const meetings = await prisma.meeting.findMany({
          where: {
            status: "SCHEDULED",
            scheduledAt: { lte: next24Hours },
            preMeetingBrief: { equals: Prisma.DbNull },
          },
          select: { id: true },
        });

        for (const meeting of meetings) {
          await preMeetingBriefQueue.add("generate", { meetingId: meeting.id });
        }
        if (meetings.length > 0) {
          log.info({ count: meetings.length }, "Enqueued pre-meeting briefs");
        }
      },
    })
  )
  // Auth routes
  .use(authRoutes)
  // Internal server-to-server routes (no user auth required)
  .use(internalSessionRoutes)
  // Protected API routes
  .group("/api", (app) =>
    app
      .use(requireAuth)
      // Core identity
      .use(orgsRoutes)
      .use(clientsRoutes)
      .use(usersRoutes)
      // Home / dashboard
      .use(homeRoutes)
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
