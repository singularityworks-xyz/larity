import { setupTelemetry } from "@larity/telemetry";

setupTelemetry("workers");

import { checkRedisHealth, connectRedis } from "@larity/infra/redis";
import { Elysia } from "elysia";
import { rootLogger } from "./logger";
import type { BaseWorker } from "./worker";

const PORT = Number.parseInt(process.env.WORKERS_PORT ?? "8080", 10);

const activeWorkers: BaseWorker[] = [];

export function registerWorker(worker: BaseWorker): void {
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

  // Instantiate and register stub workers
  const { TranscribeWorker } = await import("./transcribe.worker");
  const { SummaryWorker } = await import("./summary.worker");
  const { AudioCleanupWorker } = await import("./audio-cleanup.worker");

  registerWorker(new TranscribeWorker());
  registerWorker(new SummaryWorker());
  registerWorker(new AudioCleanupWorker());

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
    rootLogger.fatal({ err: error }, "FATAL: Uncaught exception");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    rootLogger.fatal({ err: reason }, "FATAL: Unhandled rejection");
    process.exit(1);
  });
}
