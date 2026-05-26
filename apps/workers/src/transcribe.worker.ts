import type { TranscribeJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { BaseWorker } from "./worker";

export class TranscribeWorker extends BaseWorker<
  TranscribeJobData,
  { success: boolean }
> {
  constructor() {
    super("meeting.transcribe");
  }

  protected process(
    job: Job<TranscribeJobData, { success: boolean }>
  ): Promise<{ success: boolean }> {
    this.log.info(
      { jobId: job.id, data: job.data },
      "TranscribeWorker stub received job"
    );
    // Placeholder success response (full implementation in Day 49+)
    return Promise.resolve({ success: true });
  }
}
