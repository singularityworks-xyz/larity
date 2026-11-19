import { Queue } from "bullmq";
import IORedis from "ioredis";
import { createCommonJobOptions } from "./job-options";
import {
  AUDIO_CLEANUP_QUEUE,
  CLIENT_PERSONA_QUEUE,
  PRE_MEETING_BRIEF_QUEUE,
  SUMMARY_QUEUE,
  TRANSCRIBE_QUEUE,
} from "./meeting-handoffs";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const COMMON_JOB_OPTIONS = createCommonJobOptions();

let redisConnection: IORedis | null = null;

function getRedisConnection(): IORedis {
  if (!redisConnection) {
    redisConnection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redisConnection;
}

export const transcribeQueue = new Queue(TRANSCRIBE_QUEUE, {
  // biome-ignore lint/suspicious/noExplicitAny: bullmq bundles ioredis@5.10.1 while workspace has 5.11.1
  connection: getRedisConnection() as any,
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const summaryQueue = new Queue(SUMMARY_QUEUE, {
  // biome-ignore lint/suspicious/noExplicitAny: bullmq bundles ioredis@5.10.1 while workspace has 5.11.1
  connection: getRedisConnection() as any,
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const audioCleanupQueue = new Queue(AUDIO_CLEANUP_QUEUE, {
  // biome-ignore lint/suspicious/noExplicitAny: bullmq bundles ioredis@5.10.1 while workspace has 5.11.1
  connection: getRedisConnection() as any,
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const clientPersonaQueue = new Queue(CLIENT_PERSONA_QUEUE, {
  // biome-ignore lint/suspicious/noExplicitAny: bullmq bundles ioredis@5.10.1 while workspace has 5.11.1
  connection: getRedisConnection() as any,
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const preMeetingBriefQueue = new Queue(PRE_MEETING_BRIEF_QUEUE, {
  // biome-ignore lint/suspicious/noExplicitAny: bullmq bundles ioredis@5.10.1 while workspace has 5.11.1
  connection: getRedisConnection() as any,
  defaultJobOptions: COMMON_JOB_OPTIONS,
});
