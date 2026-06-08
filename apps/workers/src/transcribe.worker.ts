import { prisma } from "@larity/infra/prisma/client";
import { getRedisClient } from "@larity/infra/redis";
import { redisKeys } from "@larity/infra/redis/keys";
import {
  createS3Client,
  GetObjectCommand,
  getS3Config,
  type S3Client,
} from "@larity/infra/s3";
import type { TranscribeJobData } from "@larity/jobs";
import { audioCleanupQueue, summaryQueue } from "@larity/jobs";
import {
  type BatchTranscriptionResult,
  transcribeAudioBuffer,
} from "@larity/stt";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import {
  type BatchUtteranceSegment,
  processOfflineCorrelation,
  type SessionSpeakerStatePayload,
  type Utterance,
} from "meeting-mode";
import { setJobStatus } from "./lib/job-status";
import type { createWorkerLogger } from "./logger";
import { BaseWorker } from "./worker";

type WorkerLogger = ReturnType<typeof createWorkerLogger>;

interface NormalizedUtterance {
  id: string;
  speaker: string;
  text: string;
  timestamp: number; // in seconds
  duration: number; // in seconds
  channel: number;
  type?: "TEAM" | "EXTERNAL";
}

interface S3Error {
  name: string;
  $metadata?: {
    httpStatusCode?: number;
  };
}

const WHITESPACE_REGEX = /\s+/;

const MAX_TIME_WINDOW_NANOS = 1_000_000_000_000;

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

/**
 * Fetches the raw audio files from S3 and transcribes them using Deepgram.
 */
async function fetchAndTranscribeAudio(
  s3Prefix: string,
  log: WorkerLogger
): Promise<{
  ch0Result: BatchTranscriptionResult | null;
  ch1Result: BatchTranscriptionResult | null;
}> {
  const s3 = createS3Client();
  try {
    const s3Config = getS3Config();

    log.info({ s3Prefix }, "Fetching audio channels from S3");
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

    const batchPromises: Promise<BatchTranscriptionResult | null>[] = [];

    if (ch0Buffer) {
      log.info("Submitting ch0 (mic) to Deepgram batch STT");
      batchPromises.push(
        transcribeAudioBuffer(ch0Buffer).catch((err) => {
          log.error({ err }, "ch0 (mic) batch STT failed");
          return null;
        })
      );
    } else {
      log.warn("ch0 (mic) audio is missing, skipping");
      batchPromises.push(Promise.resolve(null));
    }

    if (ch1Buffer) {
      log.info("Submitting ch1 (system) to Deepgram batch STT");
      batchPromises.push(
        transcribeAudioBuffer(ch1Buffer).catch((err) => {
          log.error({ err }, "ch1 (system) batch STT failed");
          return null;
        })
      );
    } else {
      log.warn("ch1 (system) audio is missing, skipping");
      batchPromises.push(Promise.resolve(null));
    }

    const [ch0Result, ch1Result] = await Promise.all(batchPromises);

    if (!(ch0Result || ch1Result)) {
      throw new Error(
        "Both batch transcription jobs failed or returned empty results"
      );
    }

    return { ch0Result, ch1Result };
  } finally {
    s3.destroy();
  }
}

/**
 * Fetches the live transcript and VAD history session state from Redis.
 */
async function fetchRedisState(
  redis: Redis,
  sessionId: string,
  log: WorkerLogger
): Promise<{
  liveUtterances: Utterance[];
  sessionState: SessionSpeakerStatePayload;
}> {
  log.info({ sessionId }, "Fetching live transcript from Redis");
  const liveUtterancesJson = await redis.lrange(
    `meeting.utterance.${sessionId}`,
    0,
    -1
  );

  const liveUtterances = liveUtterancesJson
    .map((json: string) => {
      try {
        return JSON.parse(json) as Utterance;
      } catch {
        return null;
      }
    })
    .filter((u: Utterance | null): u is Utterance => u !== null);

  const stateKey = redisKeys.meetingSessionState(sessionId);
  const sessionStateJson = await redis.get(stateKey);
  let sessionState: SessionSpeakerStatePayload = {
    vadHistory: [],
    speakerMappings: {},
    teamMembers: [],
  };
  if (sessionStateJson) {
    try {
      sessionState = JSON.parse(sessionStateJson) as SessionSpeakerStatePayload;
    } catch {
      log.warn("Invalid session state JSON in Redis");
    }
  }

  return { liveUtterances, sessionState };
}

/**
 * Builds batch utterance segments array from Deepgram results.
 */
function buildBatchSegments(
  ch0Result: BatchTranscriptionResult | null,
  ch1Result: BatchTranscriptionResult | null,
  sessionId: string,
  hostName: string
): BatchUtteranceSegment[] {
  const batchSegments: BatchUtteranceSegment[] = [];

  if (ch0Result?.utterances) {
    for (const u of ch0Result.utterances) {
      batchSegments.push({
        id: `${sessionId}:ch0:${u.start}-${u.end}`,
        text: u.text,
        timestamp: u.start,
        duration: u.end - u.start,
        channel: 0,
        speaker: hostName,
      });
    }
  }

  if (ch1Result?.utterances) {
    for (const u of ch1Result.utterances) {
      batchSegments.push({
        id: `${sessionId}:ch1:${u.start}-${u.end}`,
        text: u.text,
        timestamp: u.start,
        duration: u.end - u.start,
        channel: 1,
        speaker: `Speaker ${u.speaker}`,
      });
    }
  }

  batchSegments.sort((a, b) => a.timestamp - b.timestamp);
  return batchSegments;
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

    await setJobStatus(sessionId, "transcribe", "processing");

    try {
      const { ch0Result, ch1Result } = await fetchAndTranscribeAudio(
        s3Prefix,
        this.log
      );

      const { liveUtterances, sessionState } = await fetchRedisState(
        redis,
        sessionId,
        this.log
      );

      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
          client: true,
          participants: {
            where: { role: "HOST" },
            include: { user: true },
          },
        },
      });
      const clientName = meeting?.client?.name;
      const hostName =
        meeting?.participants?.[0]?.user?.name ||
        meeting?.participants?.[0]?.externalName ||
        "Host";

      // Reconstruct accurate connectionStartTime
      let connectionStartTime = meeting?.startedAt
        ? meeting.startedAt.getTime()
        : Date.now();
      if (liveUtterances.length > 0) {
        for (const lu of liveUtterances) {
          if (lu.timestamp && typeof lu.startOffset === "number") {
            const luTime =
              lu.timestamp > MAX_TIME_WINDOW_NANOS
                ? lu.timestamp
                : lu.timestamp * 1000;
            connectionStartTime = luTime - lu.startOffset * 1000;
            break;
          }
        }
      }

      const batchSegments = buildBatchSegments(
        ch0Result,
        ch1Result,
        sessionId,
        hostName
      );

      // Run advanced offline correlation engine
      const refinedSegments = processOfflineCorrelation({
        batchSegments,
        sessionState,
        liveUtterances,
        connectionStartTime,
        hostName,
        clientName,
      });

      const mergedUtterances: NormalizedUtterance[] = refinedSegments.map(
        (seg) => ({
          id: seg.id,
          speaker: seg.speaker,
          text: seg.text,
          timestamp: seg.timestamp,
          duration: seg.duration,
          channel: seg.channel,
          type: seg.speakerType,
        })
      );

      // 6. Persist refined transcript in Postgres
      await this.saveTranscriptToPostgres(meetingId, mergedUtterances);

      // 7. Update status to done
      await setJobStatus(sessionId, "transcribe", "done");

      // 8. Chain summary extraction job
      this.log.info({ meetingId }, "Chaining summary extraction job");
      await summaryQueue.add("meeting.summary", {
        sessionId,
        orgId,
        meetingId,
      });

      // 9. Schedule a delayed audio cleanup job (TTL of 3 hours)
      this.log.info({ sessionId }, "Scheduling audio cleanup job (3-hour TTL)");
      await audioCleanupQueue.add(
        "meeting.cleanupAudio",
        {
          sessionId,
          orgId,
          s3Prefix,
        },
        {
          delay: 3 * 60 * 60 * 1000, // 3 hours
        }
      );

      return { success: true };
    } catch (error) {
      this.log.error({ err: error }, "TranscribeWorker failed");
      await setJobStatus(sessionId, "transcribe", "failed");
      throw error;
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
