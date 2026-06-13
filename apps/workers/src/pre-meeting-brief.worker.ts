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
        });

        if (meeting?.hostId) {
          const { publish } = await import("@larity/infra/redis");
          await publish(`user_notifications:${meeting.hostId}`, {
            type: "PRE_MEETING_BRIEF_READY",
            meetingId: meeting.id,
            message: "Your AI pre-meeting brief is ready.",
          });
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
