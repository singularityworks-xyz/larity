import type { SummaryJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { BaseWorker } from "./worker";

export class SummaryWorker extends BaseWorker<
  SummaryJobData,
  { success: boolean }
> {
  constructor() {
    super("meeting.summary");
  }

  protected process(
    job: Job<SummaryJobData, { success: boolean }>
  ): Promise<{ success: boolean }> {
    this.log.info(
      { jobId: job.id, data: job.data },
      "SummaryWorker stub received job"
    );
    // Placeholder success response (full implementation in Day 52+)
    return Promise.resolve({ success: true });
  }
}
