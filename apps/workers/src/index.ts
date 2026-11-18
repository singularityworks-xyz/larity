import { checkRedisHealth, connectRedis } from "@larity/db/redis";
import { Elysia } from "elysia";
import { rootLogger } from "./logger";
import type { WorkerHealth } from "./runtime/worker";

const PORT = Number.parseInt(process.env.WORKERS_PORT ?? "8080", 10);

interface RegisteredWorker {
  close(): Promise<void>;
  getHealth(): Promise<WorkerHealth>;
}

const activeWorkers: RegisteredWorker[] = [];

export function registerWorker(worker: RegisteredWorker): void {
  activeWorkers.push(worker);
}

export async function startWorkersApp(): Promise<void> {
  rootLogger.info({ port: PORT }, "Starting workers plane...");

  const redisConnected = await connectRedis();
  if (!redisConnected) {
    rootLogger.fatal("FATAL: Could not connect to Redis");
    process.exit(1);
  }
  rootLogger.info("Redis connected");

  const { TranscribeWorker } = await import(
    "./jobs/transcribe/transcribe.worker"
  );
  const { SummaryWorker } = await import("./jobs/summary/summary.worker");
  const { AudioCleanupWorker } = await import(
    "./jobs/audio-cleanup/audio-cleanup.worker"
  );
  const { ClientPersonaWorker } = await import(
    "./jobs/client-persona/client-persona.worker"
  );
  const { PreMeetingBriefWorker } = await import(
    "./jobs/pre-meeting-brief/pre-meeting-brief.worker"
  );

  registerWorker(new TranscribeWorker());
  registerWorker(new SummaryWorker());
  registerWorker(new AudioCleanupWorker());
  registerWorker(new ClientPersonaWorker());
  registerWorker(new PreMeetingBriefWorker());

  const app = new Elysia()
    .get("/health", async () => {
      const redisHealth = await checkRedisHealth();
      const workerHealths = await Promise.all(
        activeWorkers.map(async (w) => {
          try {
            return await w.getHealth();
          } catch (error) {
            return {
              name: w.constructor.name,
              active: false,
              uptimeMs: 0,
              lastError: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );
      const allWorkersHealthy = workerHealths.every((h) => h.active);

      return {
        status: redisHealth.healthy && allWorkersHealthy ? "ok" : "degraded",
        redis: redisHealth,
        workers: workerHealths,
        uptime: Math.floor(process.uptime()),
      };
    })
    .listen(PORT, (server) => {
      if (server) {
        rootLogger.info({ port: PORT }, "Workers health server listening");
      } else {
        rootLogger.fatal(`Failed to bind to port ${PORT}`);
        process.exit(1);
      }
    });

  async function shutdown(signal: string): Promise<void> {
    rootLogger.info({ signal }, "Received signal, shutting down workers...");

    app.stop();

    await Promise.all(activeWorkers.map((w) => w.close()));

    rootLogger.info("All workers shut down");
    process.exit(0);
  }

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch((err) => {
      rootLogger.error({ err }, "SIGTERM shutdown failed");
      process.exit(1);
    });
  });

  process.on("SIGINT", () => {
    shutdown("SIGINT").catch((err) => {
      rootLogger.error({ err }, "SIGINT shutdown failed");
      process.exit(1);
    });
  });

  process.on("uncaughtException", (error) => {
    rootLogger.fatal({ error }, "FATAL: Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    rootLogger.fatal({ reason }, "FATAL: Unhandled rejection");
    process.exit(1);
  });
}
