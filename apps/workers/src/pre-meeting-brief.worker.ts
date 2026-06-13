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
      await AIBriefGeneratorService.generateAndSaveBrief(meetingId);
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
