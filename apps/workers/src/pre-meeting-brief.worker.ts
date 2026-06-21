import type { PreMeetingBriefJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { AIBriefGeneratorService } from "meeting-mode";
import { BaseWorker } from "./worker";

export class PreMeetingBriefWorker extends BaseWorker {
  constructor() {
    super("meeting.preMeetingBrief");
  }

  async process(job: Job<PreMeetingBriefJobData>): Promise<void> {
    const { meetingId } = job.data;
    this.log.info({ meetingId }, "Generating pre-meeting brief...");

    try {
      const brief =
        await AIBriefGeneratorService.generateAndSaveBrief(meetingId);
      if (brief) {
        // Fetch host to publish
        const { prisma } = await import("@larity/infra/prisma/client");
        const meeting = await prisma.meeting.findUnique({
          where: { id: meetingId },
          include: {
            participants: {
              where: { role: "HOST" },
              take: 1,
            },
          },
        });

        const hostId = meeting?.participants[0]?.userId;
        if (hostId) {
          try {
            const { publish } = await import("@larity/infra/redis");
            await publish(`user_notifications:${hostId}`, {
              type: "PRE_MEETING_BRIEF_READY",
              meetingId: meeting.id,
              message: "Your AI pre-meeting brief is ready.",
            });
          } catch (error) {
            this.log.warn(
              { meetingId, error },
              "Brief saved, but notification publish failed"
            );
          }
        }
      }

      this.log.info({ meetingId }, "Successfully generated pre-meeting brief");
    } catch (error) {
      this.log.error(
        { meetingId, error },
        "Failed to generate pre-meeting brief"
      );
      throw error;
    }
  }
}
