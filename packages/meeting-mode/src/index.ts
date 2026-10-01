import { prisma } from "@larity/db/client";
import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import type { Redis } from "ioredis";
import { AlertPublisher } from "./alerts/publisher";
import type { Alert } from "./alerts/types";
import { CommitmentManager } from "./commitment/manager";
import { ConstraintManager } from "./constraint/manager";
import type { PreloadedContextPayload } from "./constraint/types";
import { CostManager, hasPricingForModel } from "./cost/manager";
import {
  GEMINI_TIER4_MODEL,
  GENERALCOMPUTE_TIER2_MODEL,
  validateEnv,
} from "./env";
import { rootLogger } from "./logger";
import { MeetingPipelineEngine } from "./pipeline/engine";
import { getMetricsSnapshot } from "./pipeline/metrics";
import { publishPipelineEvaluationTrace } from "./pipeline/pipeline-trace";
import { PreFilter } from "./pipeline/pre-filter";
import { Tier1StructuralDetector } from "./pipeline/tier1";
import { Tier2Classifier } from "./pipeline/tier2";
import { Tier4DeepReasoner } from "./pipeline/tier4";
import { SpeakerManager } from "./speaker/manager";
import { startSubscriber, stopSubscriber } from "./subscriber";
import { UtteranceFinalizer } from "./utterance/finalizer";

const UTTERANCE_CACHE_TTL = 7 * 24 * 60 * 60;

/** Cadence for the aggregate latency snapshot log (Phase 0 observability). */
const METRICS_DUMP_INTERVAL_MS = 30_000;

/**
 * Fail fast when a configured LLM has no cost-table entry: without pricing,
 * spend is recorded at flash-lite fallback rates and the $1.60/$2.00 gates
 * trigger late (P1.9).
 */
function assertModelPricing(): void {
  const models = [GENERALCOMPUTE_TIER2_MODEL, GEMINI_TIER4_MODEL];
  for (const model of models) {
    if (!hasPricingForModel(model)) {
      throw new Error(
        `No cost pricing for configured model "${model}" — add it to MODEL_PRICING in cost/manager.ts`
      );
    }
  }
}

// biome-ignore lint/performance/noBarrelFile: structure convention
export { AlertPublisher, createAlertChannelKeys } from "./alerts/publisher";
export { AlertQueueManager } from "./alerts/queue";
export * from "./alerts/router";
export { AlertSubscriber } from "./alerts/subscriber";
export * from "./alerts/types";
export * from "./briefs/ai-brief-generator";
export * from "./channels";
export * from "./commitment";
export * from "./constraint";
export * from "./pipeline/engine";
export * from "./pipeline/metrics";
export * from "./pipeline/pre-filter";
export * from "./pipeline/tier1";
export * from "./pipeline/tier2";
export { Tier4DeepReasoner } from "./pipeline/tier4";
export * from "./pipeline/tier4-alert";
export * from "./pipeline/tier4-context";
export * from "./pipeline/types";
export { SpeakerIdentifier } from "./speaker/identifier";
export * from "./speaker/offline-correlation";
export * from "./speaker/types";
export * from "./speculative";
export * from "./utterance/types";

let finalizer: UtteranceFinalizer | null = null;
let speakerManager: SpeakerManager | null = null;
let commitmentManager: CommitmentManager | null = null;
let constraintManager: ConstraintManager | null = null;
let pipelineEngine: MeetingPipelineEngine | null = null;
let costManager: CostManager | null = null;

/** One AlertPublisher per session — avoids construction overhead per Tier alert */
const alertPublisherCache = new Map<string, AlertPublisher>();

//graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  rootLogger.info({ signal }, "Received signal, shutting down...");

  try {
    if (finalizer) {
      await finalizer.closeAll();
    }

    if (commitmentManager) {
      await commitmentManager.closeAll();
    }

    if (constraintManager) {
      await constraintManager.closeAll();
    }

    alertPublisherCache.clear();

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
    assertModelPricing();
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
  costManager = new CostManager(redisClient as Redis);

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
    costManager,
    preFilter: new PreFilter(),
    tier1: new Tier1StructuralDetector(),
    tier2: new Tier2Classifier(),
    tier4: new Tier4DeepReasoner(),
    tier4Alerts: {
      publish: async (sessionId: string, alert: Alert) => {
        let pub = alertPublisherCache.get(sessionId);
        if (!pub) {
          pub = new AlertPublisher({
            redis: redisClient as Redis,
            sessionId,
          });
          alertPublisherCache.set(sessionId, pub);
        }
        await pub.publish(alert);
      },
    },
    onPipelineSessionClosed: (sessionId) => {
      alertPublisherCache.delete(sessionId);
    },
    onUtteranceRetracted: (sessionId, utteranceId) => {
      const key = `meeting.utterance.${sessionId}`;
      (async () => {
        try {
          const list = await redisClient.lrange(key, 0, -1);
          for (let i = list.length - 1; i >= 0; i--) {
            const item = list[i];
            if (!item) {
              continue;
            }
            try {
              const parsed = JSON.parse(item) as { utteranceId?: string };
              if (parsed.utteranceId === utteranceId) {
                await redisClient.lrem(key, -1, item);
                rootLogger.info(
                  { sessionId, utteranceId },
                  "Retracted duplicate utterance from Redis list"
                );

                const retractEvent = {
                  utteranceId,
                  retracted: true,
                };
                await redisClient.publish(
                  `meeting.utterance.${sessionId}`,
                  JSON.stringify(retractEvent)
                );
                break;
              }
            } catch {
              // Ignore JSON parse errors for corrupt entries
            }
          }
        } catch (err) {
          rootLogger.error(
            { err, sessionId, utteranceId },
            "Failed to retract utterance from Redis"
          );
        }
      })();
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
    getKnownClientMembers: async (sessionId) => {
      try {
        const sessionKey = redisKeys.meetingSession(sessionId);
        const meetingId =
          (await redisClient.hget(sessionKey, "meetingId")) || sessionId;
        const meeting = await prisma.meeting.findUnique({
          where: { id: meetingId },
          select: {
            client: {
              select: { members: { select: { id: true, name: true } } },
            },
          },
        });
        return meeting?.client?.members ?? [];
      } catch (err) {
        rootLogger.error(
          { err, sessionId },
          "Failed to fetch known client members"
        );
        return [];
      }
    },
    onSpeakerIdentityGuessed: (sessionId, index, memberId) => {
      const event = {
        type: "SPEAKER_IDENTITY_GUESSED",
        payload: { deepgramIndex: index, clientMemberId: memberId },
      };
      (async () => {
        try {
          await redisClient.publish(
            `meeting.speaker_identity_guessed.${sessionId}`,
            JSON.stringify(event)
          );
        } catch (err) {
          rootLogger.warn(
            { err, sessionId },
            "Failed to publish SPEAKER_IDENTITY_GUESSED event"
          );
        }
      })();
    },
  });

  finalizer.onUtterancePublished(async (utterance, options) => {
    if (!pipelineEngine) {
      return;
    }

    // Append to Redis list for post-processing worker retrieval (with 7-day TTL)
    const key = `meeting.utterance.${utterance.sessionId}`;
    const payload = JSON.stringify(utterance, (k, val) =>
      k === "embeddingPromise" ? undefined : val
    );

    // P2.4: speaker corrections for an already-published utterance replace
    // the cached entry in place and must NOT re-queue the pipeline (which
    // would re-run Tier 2/3/4 and duplicate the list entry).
    if (options?.republish) {
      try {
        const list = await redisClient.lrange(key, 0, -1);
        const index = list.findIndex((item) => {
          try {
            return (
              (JSON.parse(item) as { utteranceId?: string }).utteranceId ===
              utterance.utteranceId
            );
          } catch {
            return false;
          }
        });
        if (index >= 0) {
          await redisClient.lset(key, index, payload);
        } else {
          await redisClient.rpush(key, payload);
        }
      } catch (err) {
        rootLogger.error(
          { err, sessionId: utterance.sessionId },
          "Failed to replace re-identified utterance in Redis"
        );
      }
      return;
    }

    // P2.10: single round trip (MULTI) instead of serial RPUSH + EXPIRE.
    // EXPIRE stays per-utterance so the 7-day TTL always counts from the
    // latest line rather than hydration time.
    try {
      const multi = redisClient.multi();
      multi.rpush(key, payload);
      multi.expire(key, UTTERANCE_CACHE_TTL);
      await multi.exec();
    } catch (err) {
      rootLogger.error(
        { err, sessionId: utterance.sessionId },
        "Failed to cache live utterance in Redis"
      );
    }

    pipelineEngine.evaluateUtteranceQueued(
      utterance,
      // P2.9: telemetry must not hold the per-session FIFO chain — the next
      // utterance's Tier 2 start no longer waits for this trace publish.
      (utt, evaluation) => {
        publishPipelineEvaluationTrace(redisClient, utt, evaluation).catch(
          (err: unknown) => {
            rootLogger.error(
              { err, utteranceId: utt.utteranceId },
              "Pipeline trace publish failed"
            );
          }
        );
        return Promise.resolve();
      }
    );
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

  // Aggregate-only latency snapshot (no per-session labels). Lets operators
  // verify pipeline latency without a metrics backend.
  const metricsTimer = setInterval(() => {
    rootLogger.info(
      { metrics: getMetricsSnapshot() },
      "Latency metrics snapshot"
    );
  }, METRICS_DUMP_INTERVAL_MS);
  metricsTimer.unref();

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  rootLogger.info("Shutdown handlers registered");
  rootLogger.info("Ready to process STT results");
  rootLogger.info("============================================");
}

if (import.meta.main) {
  main().catch((error) => {
    rootLogger.fatal({ err: error }, "Unhandled error");
    process.exit(1);
  });
}
