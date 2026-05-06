import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "@larity/infra/redis";
import { redisKeys } from "@larity/infra/redis/keys";
import type { Redis } from "ioredis";
import { AlertPublisher } from "./alerts/publisher";
import type { Alert } from "./alerts/types";
import { CommitmentManager } from "./commitment/manager";
import { ConstraintManager } from "./constraint/manager";
import type { PreloadedContextPayload } from "./constraint/types";
import { validateEnv } from "./env";
import { rootLogger } from "./logger";
import { MeetingPipelineEngine } from "./pipeline/engine";
import { publishPipelineEvaluationTrace } from "./pipeline/pipeline-trace";
import { PreFilter } from "./pipeline/pre-filter";
import { Tier1StructuralDetector } from "./pipeline/tier1";
import { Tier2Classifier } from "./pipeline/tier2";
import { Tier4DeepReasoner } from "./pipeline/tier4";
import { SpeakerManager } from "./speaker/manager";
import { startSubscriber, stopSubscriber } from "./subscriber";
import { UtteranceFinalizer } from "./utterance/finalizer";

// biome-ignore lint/performance/noBarrelFile: structure convention
export { AlertPublisher, createAlertChannelKeys } from "./alerts/publisher";
export { AlertQueueManager } from "./alerts/queue";
export * from "./alerts/router";
export { AlertSubscriber } from "./alerts/subscriber";
export * from "./alerts/types";
export * from "./channels";
export * from "./commitment";
export * from "./constraint";
export * from "./pipeline/engine";
export { getMetricsText, startDefaultMetrics } from "./pipeline/metrics";
export * from "./pipeline/pre-filter";
export * from "./pipeline/tier1";
export * from "./pipeline/tier2";
export { Tier4DeepReasoner } from "./pipeline/tier4";
export * from "./pipeline/tier4-alert";
export * from "./pipeline/tier4-context";
export * from "./pipeline/types";
export { SpeakerIdentifier } from "./speaker/identifier";
export * from "./speaker/types";
export * from "./speculative";
export * from "./utterance/types";

let finalizer: UtteranceFinalizer | null = null;
let speakerManager: SpeakerManager | null = null;
let commitmentManager: CommitmentManager | null = null;
let constraintManager: ConstraintManager | null = null;
let pipelineEngine: MeetingPipelineEngine | null = null;

//graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  rootLogger.info({ signal }, "Received signal, shutting down...");

  try {
    if (finalizer) {
      await finalizer.closeAll();
    }

    if (commitmentManager) {
      commitmentManager.closeAll();
    }

    if (constraintManager) {
      constraintManager.closeAll();
    }

    if (pipelineEngine) {
      pipelineEngine.closeAll();
    }

    await stopSubscriber();
    await disconnectRedis();

    rootLogger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    rootLogger.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  rootLogger.info("============================================");
  rootLogger.info("           Larity Meeting Mode              ");
  rootLogger.info("           Utterance Finalizer              ");
  rootLogger.info("============================================");

  try {
    validateEnv();
    rootLogger.info("Environment variables validated");
  } catch (error) {
    rootLogger.fatal({ err: error }, "Environment validation failed");
    process.exit(1);
  }

  const connected = await connectRedis();
  if (!connected) {
    rootLogger.fatal("Failed to connect to Redis. Exiting.");
    process.exit(1);
  }

  const redisClient = getRedisClient();
  if (!redisClient) {
    rootLogger.fatal("Redis client is not available. Exiting.");
    process.exit(1);
  }

  speakerManager = new SpeakerManager();
  commitmentManager = new CommitmentManager(
    redisClient as unknown as ConstructorParameters<typeof CommitmentManager>[0]
  );
  constraintManager = new ConstraintManager(
    redisClient as unknown as ConstructorParameters<typeof ConstraintManager>[0]
  );
  finalizer = new UtteranceFinalizer(
    {
      publish: (channel, message) => redisClient.publish(channel, message),
      hset: (key, field, value) => redisClient.hset(key, field, value),
    },
    {
      topicManager: {
        enableAsyncSummarization: false,
      },
    }
  );

  pipelineEngine = new MeetingPipelineEngine({
    finalizer,
    constraintManager,
    commitmentManager,
    preFilter: new PreFilter(),
    tier1: new Tier1StructuralDetector(),
    tier2: new Tier2Classifier(),
    tier4: new Tier4DeepReasoner(),
    tier4Alerts: {
      publish: async (sessionId: string, alert: Alert) =>
        new AlertPublisher({
          redis: redisClient as Redis,
          sessionId,
        }).publish(alert),
    },
    getContextPayload: async (sessionId) => {
      const payload = await redisClient.get(
        redisKeys.meetingContext(sessionId)
      );
      if (!payload) {
        return null;
      }

      try {
        return JSON.parse(payload) as PreloadedContextPayload;
      } catch {
        rootLogger.warn({ sessionId }, "Invalid meeting context payload");
        return null;
      }
    },
    getCurrentTopicLabel: async (sessionId, topicId) =>
      finalizer?.getTopicLabel(sessionId, topicId),
  });

  finalizer.onUtterancePublished(async (utterance) => {
    if (!pipelineEngine) {
      return;
    }

    const evaluation = await pipelineEngine.evaluateUtterance(utterance);
    await publishPipelineEvaluationTrace(redisClient, utterance, evaluation);
  });

  await startSubscriber(
    finalizer,
    speakerManager,
    redisClient as unknown as Parameters<typeof startSubscriber>[2],
    commitmentManager,
    constraintManager,
    pipelineEngine
  );
  rootLogger.info("Utterance Finalizer is running");

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  rootLogger.info("Shutdown handlers registered");
  rootLogger.info("Ready to process STT results");
  rootLogger.info("============================================");
}

main().catch((error) => {
  rootLogger.fatal({ err: error }, "Unhandled error");
  process.exit(1);
});
