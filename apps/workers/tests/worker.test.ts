import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock ioredis default export before any imports to prevent real network calls
const mockRedisQuit = mock(() => Promise.resolve());

class MockIORedis {
  quit = mockRedisQuit;
  on = mock(() => this);
}

mock.module("ioredis", () => ({
  default: MockIORedis,
}));

// Mock bullmq Worker before any imports
const mockWorkerOn = mock();
const mockWorkerClose = mock(() => Promise.resolve());
const mockGetJobCounts = mock(() =>
  Promise.resolve({ active: 0, waiting: 0, failed: 0, completed: 0 })
);

class MockWorker {
  readonly name: string;
  on = mockWorkerOn;
  close = mockWorkerClose;
  getJobCounts = mockGetJobCounts;
  isPaused = () => false;

  constructor(
    queueName: string,
    _handler: (job: unknown) => Promise<unknown>,
    _options?: Record<string, unknown>
  ) {
    this.name = queueName;
  }
}

const mockWorkerConstructor = mock(
  (
    queueName: string,
    handler: (job: unknown) => Promise<unknown>,
    options?: Record<string, unknown>
  ) => {
    return new MockWorker(queueName, handler, options);
  }
);

mock.module("bullmq", () => ({
  Worker: mockWorkerConstructor,
}));

describe("BaseWorker", () => {
  beforeEach(() => {
    mockWorkerOn.mockClear();
    mockWorkerClose.mockClear();
    mockGetJobCounts.mockClear();
    mockWorkerConstructor.mockClear();
    mockRedisQuit.mockClear();
  });

  it("should create a worker and delegate process to subclass", async () => {
    const { BaseWorker } = await import("../src/worker");

    class TestWorker extends BaseWorker<{ x: number }, number> {
      // biome-ignore lint/suspicious/useAwait: test stub matches abstract signature
      async process(job: { data: { x: number } }): Promise<number> {
        return job.data.x * 2;
      }
    }

    const worker = new TestWorker("test-queue");
    expect(worker).toBeDefined();

    // Verify the worker registered event listeners
    expect(mockWorkerOn).toHaveBeenCalledWith("failed", expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith("error", expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith("ready", expect.any(Function));
    expect(mockWorkerOn).toHaveBeenCalledWith("closing", expect.any(Function));

    await worker.close();
    expect(mockWorkerClose).toHaveBeenCalled();
  });

  it("should support custom concurrency", async () => {
    const { BaseWorker } = await import("../src/worker");

    class ConcWorker extends BaseWorker<unknown, void> {
      // biome-ignore lint/suspicious/noEmptyBlockStatements: test stub
      async process(): Promise<void> {}
    }

    const worker = new ConcWorker("conc-queue", { concurrency: 10 });
    expect(worker).toBeDefined();

    expect(mockWorkerConstructor).toHaveBeenCalled();
    const calls = mockWorkerConstructor.mock.calls;
    const lastCall = calls.at(-1);
    expect(lastCall).toBeDefined();
    expect(lastCall?.[0]).toBe("conc-queue");
    expect(lastCall?.[2]).toBeDefined();
    expect(lastCall?.[2]?.concurrency).toBe(10);

    await worker.close();
  });

  it("should report health with job counts", async () => {
    const { BaseWorker } = await import("../src/worker");

    mockGetJobCounts.mockImplementation(() =>
      Promise.resolve({ active: 2, waiting: 5, failed: 1, completed: 100 })
    );

    class HealthWorker extends BaseWorker<unknown, void> {
      // biome-ignore lint/suspicious/noEmptyBlockStatements: test stub
      async process(): Promise<void> {}
    }

    const worker = new HealthWorker("health-queue");
    const health = await worker.getHealth();

    expect(health.name).toContain("health-queue");
    expect(health.jobCounts).toBeDefined();
    expect(health.jobCounts?.active).toBe(2);
    expect(health.jobCounts?.waiting).toBe(5);
    expect(health.jobCounts?.failed).toBe(1);
    expect(health.jobCounts?.completed).toBe(100);
    expect(health.uptimeMs).toBeGreaterThanOrEqual(0);

    await worker.close();
  });

  it("should expose and close cleanly", async () => {
    const { BaseWorker } = await import("../src/worker");

    class LifecycleWorker extends BaseWorker<unknown, void> {
      // biome-ignore lint/suspicious/noEmptyBlockStatements: test stub
      async process(): Promise<void> {}
    }

    const worker = new LifecycleWorker("lifecycle-queue");
    await worker.close();

    // Calling close twice should not throw
    await worker.close();
  });
});
