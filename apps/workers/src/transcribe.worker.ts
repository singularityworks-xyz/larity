import { prisma } from "@larity/infra/prisma/client";
import { getRedisClient } from "@larity/infra/redis";
import {
  createS3Client,
  GetObjectCommand,
  getS3Config,
  type S3Client,
} from "@larity/infra/s3";
import type { TranscribeJobData } from "@larity/jobs";
import { summaryQueue } from "@larity/jobs";
import {
  type BatchTranscriptionResult,
  transcribeAudioBuffer,
} from "@larity/stt";
import type { Job } from "bullmq";
import { BaseWorker } from "./worker";

interface NormalizedUtterance {
  id: string;
  speaker: string;
  text: string;
  timestamp: number; // in seconds
  duration: number; // in seconds
  channel: number;
}

interface S3Error {
  name: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

const WHITESPACE_REGEX = /\s+/;

/**
 * Downloads a file from S3 and returns its contents as a Buffer.
 * Returns null if the file does not exist.
 */
async function downloadS3File(
  s3: S3Client,
  bucket: string,
  key: string
): Promise<Buffer | null> {
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    if (!response.Body) {
      return null;
    }
    return Buffer.from(await response.Body.transformToByteArray());
  } catch (error: unknown) {
    const s3Err = error as S3Error;
    if (s3Err.name === "NoSuchKey" || s3Err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export class TranscribeWorker extends BaseWorker<
  TranscribeJobData,
  { success: boolean }
> {
  constructor() {
    super("meeting.transcribe");
  }

  protected async process(
    job: Job<TranscribeJobData, { success: boolean }>
  ): Promise<{ success: boolean }> {
    const { sessionId, orgId, meetingId, s3Prefix } = job.data;

    this.log.info(
      { jobId: job.id, sessionId, meetingId },
      "TranscribeWorker started processing"
    );

    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis client is not available");
    }

    const statusKey = `meeting.job.${sessionId}.transcribe.status`;
    await redis.set(statusKey, "processing");
    await redis.expire(statusKey, 7 * 24 * 60 * 60); // 7 days

    try {
      const s3 = createS3Client();
      const s3Config = getS3Config();

      // 2. Fetch raw audio files from S3
      this.log.info({ s3Prefix }, "Fetching audio channels from S3");
      const ch0Buffer = await downloadS3File(
        s3,
        s3Config.bucket,
        `${s3Prefix}/ch0.pcm16`
      );
      const ch1Buffer = await downloadS3File(
        s3,
        s3Config.bucket,
        `${s3Prefix}/ch1.pcm16`
      );

      if (!(ch0Buffer || ch1Buffer)) {
        throw new Error(
          `No audio files found in S3 bucket for prefix: ${s3Prefix}`
        );
      }

      // 3. Submit available channels to Deepgram Batch STT
      const batchPromises: Promise<BatchTranscriptionResult | null>[] = [];

      if (ch0Buffer) {
        this.log.info("Submitting ch0 (mic) to Deepgram batch STT");
        batchPromises.push(
          transcribeAudioBuffer(ch0Buffer).catch((err) => {
            this.log.error({ err }, "ch0 (mic) batch STT failed");
            return null;
          })
        );
      } else {
        this.log.warn("ch0 (mic) audio is missing, skipping");
        batchPromises.push(Promise.resolve(null));
      }

      if (ch1Buffer) {
        this.log.info("Submitting ch1 (system) to Deepgram batch STT");
        batchPromises.push(
          transcribeAudioBuffer(ch1Buffer).catch((err) => {
            this.log.error({ err }, "ch1 (system) batch STT failed");
            return null;
          })
        );
      } else {
        this.log.warn("ch1 (system) audio is missing, skipping");
        batchPromises.push(Promise.resolve(null));
      }

      const [ch0Result, ch1Result] = await Promise.all(batchPromises);

      if (!(ch0Result || ch1Result)) {
        throw new Error(
          "Both batch transcription jobs failed or returned empty results"
        );
      }

      // 4. Fetch the live transcript from Redis if available
      this.log.info({ sessionId }, "Fetching live transcript from Redis");
      const liveUtterancesJson = await redis.lrange(
        `meeting.utterance.${sessionId}`,
        0,
        -1
      );

      interface LiveUtterance {
        timestamp: number;
        text: string;
        speaker?: {
          name?: string;
        };
      }

      const liveUtterances: LiveUtterance[] = liveUtterancesJson
        .map((json) => {
          try {
            return JSON.parse(json) as LiveUtterance;
          } catch {
            return null;
          }
        })
        .filter((u): u is LiveUtterance => u !== null);

      // 5. Fetch host identity from DB if possible
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          participants: {
            where: { role: "HOST" },
            include: { user: true },
          },
        },
      });
      const hostName =
        meeting?.participants?.[0]?.user?.name ||
        meeting?.participants?.[0]?.externalName ||
        "Host";

      const mergedUtterances: NormalizedUtterance[] = [];

      this.processBatchResults(
        ch0Result,
        ch1Result,
        sessionId,
        hostName,
        mergedUtterances
      );

      // Reconcile with live transcript if available
      if (liveUtterances.length > 0) {
        this.log.info(
          { liveCount: liveUtterances.length },
          "Reconciling batch transcript with live utterances"
        );
        this.reconcileWithLiveTranscript(mergedUtterances, liveUtterances);
      }

      // 6. Persist refined transcript in Postgres
      await this.saveTranscriptToPostgres(meetingId, mergedUtterances);

      // 7. Update status to done
      await redis.set(statusKey, "done");

      // 8. Chain summary extraction job
      this.log.info({ meetingId }, "Chaining summary extraction job");
      await summaryQueue.add("meeting.summary", {
        sessionId,
        orgId,
        meetingId,
      });

      return { success: true };
    } catch (error) {
      this.log.error({ err: error }, "TranscribeWorker failed");
      await redis.set(statusKey, "failed");
      throw error;
    }
  }

  private processBatchResults(
    ch0Result: BatchTranscriptionResult | null,
    ch1Result: BatchTranscriptionResult | null,
    sessionId: string,
    hostName: string,
    mergedUtterances: NormalizedUtterance[]
  ): void {
    // Process ch0 (Host / Mic)
    if (ch0Result?.utterances) {
      for (const u of ch0Result.utterances) {
        mergedUtterances.push({
          id: `${sessionId}:ch0:${u.start}-${u.end}`,
          speaker: hostName,
          text: u.text,
          timestamp: u.start,
          duration: u.end - u.start,
          channel: 0,
        });
      }
    }

    // Process ch1 (Remote / System Audio)
    if (ch1Result?.utterances) {
      for (const u of ch1Result.utterances) {
        mergedUtterances.push({
          id: `${sessionId}:ch1:${u.start}-${u.end}`,
          speaker: `Speaker ${u.speaker}`,
          text: u.text,
          timestamp: u.start,
          duration: u.end - u.start,
          channel: 1,
        });
      }
    }

    // Sort chronologically by start time
    mergedUtterances.sort((a, b) => a.timestamp - b.timestamp);
  }

  private reconcileWithLiveTranscript(
    mergedUtterances: NormalizedUtterance[],
    liveUtterances: Array<{ timestamp: number; speaker?: { name?: string } }>
  ): void {
    for (const bu of mergedUtterances) {
      // Find overlapping live utterance (within 3 seconds)
      const matchedLiveUtt = liveUtterances.find((lu) => {
        const luTimeSec =
          lu.timestamp > 1_000_000_000_000 ? lu.timestamp / 1000 : lu.timestamp;
        return Math.abs(bu.timestamp - luTimeSec) <= 3.0;
      });

      if (matchedLiveUtt?.speaker?.name) {
        bu.speaker = matchedLiveUtt.speaker.name;
      }
    }
  }

  private async saveTranscriptToPostgres(
    meetingId: string,
    mergedUtterances: NormalizedUtterance[]
  ): Promise<void> {
    const durationSec =
      mergedUtterances.length > 0
        ? Math.max(...mergedUtterances.map((u) => u.timestamp + u.duration))
        : 0;

    const totalWords = mergedUtterances.reduce((acc, u) => {
      const wordsCount = u.text
        .trim()
        .split(WHITESPACE_REGEX)
        .filter((w) => w.length > 0).length;
      return acc + wordsCount;
    }, 0);

    this.log.info(
      { meetingId, durationSec, wordCount: totalWords },
      "Saving refined transcript to Postgres"
    );

    await prisma.transcript.upsert({
      where: { meetingId },
      create: {
        meetingId,
        content: JSON.stringify(mergedUtterances),
        format: "NORMALIZED",
        duration: Math.round(durationSec),
        wordCount: totalWords,
      },
      update: {
        content: JSON.stringify(mergedUtterances),
        format: "NORMALIZED",
        duration: Math.round(durationSec),
        wordCount: totalWords,
      },
    });
  }
}
