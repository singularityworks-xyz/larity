import { cron } from "@elysiajs/cron";
import { Prisma } from "@larity/db/prisma";
import { preMeetingBriefQueue } from "@larity/jobs";
import { enqueuePreMeetingBrief } from "@larity/jobs/meeting-handoffs";
import { prisma } from "../../../lib/prisma";
import { createControlLogger } from "../../../logger";

const log = createControlLogger("server");

export const preMeetingBriefSchedule = cron({
  name: "pre-meeting-brief-generator",
  pattern: "0 * * * *",
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
});
