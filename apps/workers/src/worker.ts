import { type Job, Worker } from "bullmq";
import IORedis from "ioredis";
import { createWorkerLogger } from "./logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export interface WorkerHealth {
  name: string;
  active: boolean;
  jobCounts?: {
    active: number;
    waiting: number;
    failed: number;
    completed: number;
  };
  lastError?: string;
  uptimeMs: number;
}

export abstract class BaseWorker<TJobData = unknown, TJobResult = unknown> {
  protected readonly worker: Worker<TJobData, TJobResult>;
  protected readonly log: ReturnType<typeof createWorkerLogger>;
  private readonly connection: IORedis;
  private readonly _ownsRedis: boolean;
  private readonly startedAt: number;
  private lastError: string | undefined;

  constructor(
    queueName: string,
    options?: {
      concurrency?: number;
      prefix?: string;
      connection?: IORedis;
    }
  ) {
    this.startedAt = Date.now();
    this.log = createWorkerLogger(`${queueName}-worker`);
    this.lastError = undefined;
    this._ownsRedis = !options?.connection;

    this.connection =
      options?.connection ??
      new IORedis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });

    this.worker = new Worker<TJobData, TJobResult>(
      queueName,
      async (job: Job<TJobData, TJobResult>) => {
        const start = performance.now();
        this.log.info(
          { jobId: job.id, data: job.data },
          `Processing job ${job.id}`
        );
        try {
          const result = await this.process(job);
          const duration = performance.now() - start;
          this.log.info(
            { jobId: job.id, durationMs: Math.round(duration) },
            `Job ${job.id} completed`
          );
          return result;
        } catch (error) {
          const duration = performance.now() - start;
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.log.error(
            { jobId: job.id, err: error, durationMs: Math.round(duration) },
            `Job ${job.id} failed: ${message}`
          );
          throw error;
        }
      },
      {
        connection: this.connection,
        concurrency: options?.concurrency ?? 5,
        prefix: options?.prefix,
      }
    );

    this.worker.on(
      "failed",
      (job: Job<TJobData, TJobResult> | undefined, error: Error) => {
        this.lastError = error.message;
        this.log.error(
          { jobId: job?.id, err: error, stack: error.stack },
          `Worker failed on job ${job?.id}`
        );
      }
    );

    this.worker.on("error", (error: Error) => {
      this.lastError = error.message;
      this.log.error({ err: error }, "Worker error");
    });

    this.worker.on("ready", () => {
      this.log.info("Worker is ready");
    });

    this.worker.on("closing", (msg: string) => {
      this.log.info({ msg }, "Worker closing");
    });
  }

  protected abstract process(
    job: Job<TJobData, TJobResult>
  ): Promise<TJobResult>;

  async close(): Promise<void> {
    this.log.info("Closing worker...");
    await this.worker.close();
    if (this._ownsRedis) {
      await this.connection.quit();
    }
    this.log.info("Worker closed");
  }

  async getHealth(): Promise<WorkerHealth> {
    return {
      name: this.worker.name,
      active: !this.worker.isPaused(),
      lastError: this.lastError,
      uptimeMs: Date.now() - this.startedAt,
    };
  }
}
