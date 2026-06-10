import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockS3Send = mock(() => Promise.resolve({}));
const mockWorkerOn = mock();

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send(cmd: any) {
      if ((globalThis as any).s3SendMock) {
        return (globalThis as any).s3SendMock(cmd);
      }
      return Promise.resolve({});
    }
  },
  DeleteObjectCommand: class MockDeleteObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "DeleteObjectCommand",
          input,
        });
      }
    }
  },
  PutObjectCommand: class MockPutObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "PutObjectCommand",
          input,
        });
      }
    }
  },
  GetObjectCommand: class MockGetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
      if ((globalThis as any).s3Calls) {
        (globalThis as any).s3Calls.push({
          command: "GetObjectCommand",
          input,
        });
      }
    }
  },
}));

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    readonly name: string;
    on = mockWorkerOn;
    constructor(queueName: string) {
      this.name = queueName;
    }
    isPaused() {
      return false;
    }
    close() {
      return Promise.resolve();
    }
    getJobCounts() {
      return Promise.resolve({
        active: 0,
        waiting: 0,
        failed: 0,
        completed: 0,
      });
    }
  },
}));

describe("AudioCleanupWorker", () => {
  beforeEach(() => {
    (globalThis as any).s3SendMock = mockS3Send;
    mockS3Send.mockClear();
  });

  afterEach(() => {
    (globalThis as any).s3SendMock = undefined;
  });

  it("should delete ch0, ch1, manifest, and session_state files from S3", async () => {
    const { AudioCleanupWorker } = await import("../src/audio-cleanup.worker");

    const worker = new AudioCleanupWorker();
    expect(worker).toBeDefined();

    const mockJob = {
      id: "job-1",
      data: {
        sessionId: "session-1",
        orgId: "org-1",
        s3Prefix: "org-1/session-1",
      },
    };

    const result = await (worker as any).process(mockJob);
    expect(result.success).toBe(true);

    // Should have deleted 4 files
    expect(mockS3Send).toHaveBeenCalledTimes(4);

    const calls = mockS3Send.mock.calls;
    const deletedKeys = calls.map((call: any) => {
      const cmd = call[0];
      return cmd.input.Key;
    });

    expect(deletedKeys).toContain("org-1/session-1/ch0.pcm16");
    expect(deletedKeys).toContain("org-1/session-1/ch1.pcm16");
    expect(deletedKeys).toContain("org-1/session-1/manifest.json");
    expect(deletedKeys).toContain("org-1/session-1/session_state.json");

    await worker.close();
  });
});
