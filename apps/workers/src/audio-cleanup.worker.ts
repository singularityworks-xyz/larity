import {
  createS3Client,
  DeleteObjectCommand,
  getS3Config,
} from "@larity/infra/s3";
import type { AudioCleanupJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { BaseWorker } from "./worker";

export class AudioCleanupWorker extends BaseWorker<
  AudioCleanupJobData,
  { success: boolean }
> {
  private readonly s3Client = createS3Client();
  private readonly bucketName = getS3Config().bucket;

  constructor() {
    super("meeting.cleanupAudio");
  }

  protected async process(
    job: Job<AudioCleanupJobData, { success: boolean }>
  ): Promise<{ success: boolean }> {
    const { sessionId, s3Prefix } = job.data;

    this.log.info(
      { jobId: job.id, sessionId, s3Prefix },
      "Starting audio cleanup task"
    );

    // List of files to delete at the end of the meeting's TTL
    const filesToDelete = [
      `${s3Prefix}/ch0.pcm16`,
      `${s3Prefix}/ch1.pcm16`,
      `${s3Prefix}/manifest.json`,
      `${s3Prefix}/session_state.json`,
    ];

    const deletePromises = filesToDelete.map(async (key) => {
      try {
        this.log.debug(
          { key, bucket: this.bucketName },
          "Deleting object from S3"
        );
        await this.s3Client.send(
          new DeleteObjectCommand({
            Bucket: this.bucketName,
            Key: key,
          })
        );
        this.log.debug({ key }, "Successfully deleted object from S3");
      } catch (error) {
        this.log.error(
          { key, err: error },
          `Failed to delete object ${key} from S3`
        );
        // Rethrow so BullMQ can handle retries and report failure
        throw error;
      }
    });

    await Promise.all(deletePromises);

    this.log.info(
      { sessionId, s3Prefix },
      "Audio cleanup completed successfully"
    );

    return { success: true };
  }
}
