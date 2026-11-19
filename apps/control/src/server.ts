import { cors } from "@elysiajs/cors";
import { cron } from "@elysiajs/cron";
import { Prisma } from "@larity/db/prisma";
import { preMeetingBriefQueue } from "@larity/jobs";
import { enqueuePreMeetingBrief } from "@larity/jobs/meeting-handoffs";
import { Elysia } from "elysia";
import { env } from "./env";
import { clientsRoutes } from "./features/clients/clients.routes";
import { policyGuardrailsRoutes } from "./features/clients/guardrails/policy-guardrails.routes";
import { documentsRoutes } from "./features/documents/documents.routes";
import { homeRoutes } from "./features/home/home.routes";
import { authRoutes } from "./features/identity/auth.routes";
import { orgsRoutes } from "./features/identity/orgs.routes";
import { usersRoutes } from "./features/identity/users.routes";
import { decisionsRoutes } from "./features/meeting-records/decisions/decisions.routes";
import { importantPointsRoutes } from "./features/meeting-records/important-points/important-points.routes";
import { openQuestionsRoutes } from "./features/meeting-records/open-questions/open-questions.routes";
import { tasksRoutes } from "./features/meeting-records/tasks/tasks.routes";
import { internalSessionRoutes } from "./features/meetings/internal-session.routes";
import { meetingSessionRoutes } from "./features/meetings/meeting-session.routes";
import { meetingsRoutes } from "./features/meetings/meetings.routes";
import { notificationsRoutes } from "./features/notifications/notifications.routes";
import { remindersRoutes } from "./features/reminders/reminders.routes";
import { prisma } from "./lib/prisma";
import { createControlLogger } from "./logger";
import { requireAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";

const log = createControlLogger("server");

export const app = new Elysia()
  .use(requestLogger)
  .use(
    cors({
      origin: (request) => {
        const origin = request.headers.get("origin");
        if (!origin) {
          return false;
        }

        // Public waitlist route can be accessed from any origin
        const url = new URL(request.url);
        if (url.pathname === "/api/waitlist") {
          return true;
        }

        // Restrict all other routes to trusted frontend origins
        return env.FRONTEND_ORIGINS.includes(origin);
      },
      credentials: true,
    })
  )
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
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .use(
    cron({
      name: "pre-meeting-brief-generator",
      pattern: "0 * * * *", // Every hour
      async run() {
        log.info("Running pre-meeting brief cron...");
        const now = new Date();
        const next24Hours = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const meetings = await prisma.meeting.findMany({
          where: {
            status: "SCHEDULED",
            scheduledAt: { gte: now, lte: next24Hours },
            preMeetingBrief: { equals: Prisma.DbNull },
          },
          select: { id: true },
        });

        for (const meeting of meetings) {
          try {
            await enqueuePreMeetingBrief(preMeetingBriefQueue, meeting.id);
          } catch (error) {
            log.error(
              { err: error, meetingId: meeting.id },
              "Failed to enqueue pre-meeting brief job"
            );
          }
        }
        if (meetings.length > 0) {
          log.info({ count: meetings.length }, "Enqueued pre-meeting briefs");
        }
      },
    })
  )
  .use(authRoutes)
  .use(internalSessionRoutes)

  .group("/api", (app) =>
    app
      .use(requireAuth)
      .use(orgsRoutes)
      .use(clientsRoutes)
      .use(usersRoutes)
      .use(notificationsRoutes)
      .use(homeRoutes)
      .use(meetingsRoutes)
      .use(tasksRoutes)
      .use(decisionsRoutes)
      .use(openQuestionsRoutes)
      .use(importantPointsRoutes)
      .use(policyGuardrailsRoutes)
      .use(documentsRoutes)
      .use(remindersRoutes)
      .use(meetingSessionRoutes)
  );

export type App = typeof app;
