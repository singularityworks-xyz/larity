import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MAX_JOB_ATTEMPTS = 3;
const BACKOFF_DELAY_MS = Number(process.env.BACKOFF_DELAY_MS ?? "5000");

const COMMON_JOB_OPTIONS = {
  attempts: MAX_JOB_ATTEMPTS,
  backoff: {
    type: "exponential" as const,
    delay: BACKOFF_DELAY_MS,
  },
};

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

export const transcribeQueue = new Queue("meeting.transcribe", {
  connection: getRedisConnection(),
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const summaryQueue = new Queue("meeting.summary", {
  connection: getRedisConnection(),
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const audioCleanupQueue = new Queue("meeting.cleanupAudio", {
  connection: getRedisConnection(),
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const clientPersonaQueue = new Queue("client.personaExtraction", {
  connection: getRedisConnection(),
  defaultJobOptions: COMMON_JOB_OPTIONS,
});

export const preMeetingBriefQueue = new Queue("meeting.preMeetingBrief", {
  connection: getRedisConnection(),
  defaultJobOptions: COMMON_JOB_OPTIONS,
});
