import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
// biome-ignore lint/performance/noNamespaceImport: needed for spyOn mocking
import * as infraRedis from "@larity/infra/redis";

const mockS3Send = mock();
const mockRedisSet = mock();
const mockRedisExpire = mock();
const mockRedisLrange = mock();
const mockRedisGet = mock();
const mockPrismaMeetingFindUnique = mock();
const mockPrismaTranscriptUpsert = mock();
const mockSummaryQueueAdd = mock();
const mockTranscribeAudioBuffer = mock();

mock.module("@larity/stt", () => ({
  transcribeAudioBuffer: mockTranscribeAudioBuffer,
}));

// Mock modules
mock.module("@larity/infra/s3", () => ({
  createS3Client: () => ({
    send: (cmd: any) => {
      if ((globalThis as any).s3SendMock) {
        return (globalThis as any).s3SendMock(cmd);
      }
      return Promise.resolve({});
    },
    destroy: () => {
      // noop
    },
  }),
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
  getS3Config: () => ({
    bucket: "test-bucket",
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
  }),
}));

mock.module("@larity/infra/prisma/client", () => ({
  prisma: {
    meeting: {
      findUnique: mockPrismaMeetingFindUnique,
    },
    transcript: {
      upsert: mockPrismaTranscriptUpsert,
    },
  },
}));

mock.module("bullmq", () => ({
  Worker: class MockWorker {
    readonly name: string;
    on = mock();
    constructor(queueName: string) {
      this.name = queueName;
    }
    isPaused() {
      return false;
    }
    close() {
      return Promise.resolve();
    }
  },
  Queue: class MockQueue {
    add = mockSummaryQueueAdd;
  },
}));

const mockAudioCleanupQueueAdd = mock();

mock.module("@larity/jobs", () => ({
  summaryQueue: {
    add: mockSummaryQueueAdd,
  },
  audioCleanupQueue: {
    add: mockAudioCleanupQueueAdd,
  },
  transcribeQueue: {
    add: mock(),
  },
  clientPersonaQueue: {
    add: mock(),
  },
}));

describe("TranscribeWorker", () => {
  let getRedisClientSpy: any;
  let connectRedisSpy: any;
  let disconnectRedisSpy: any;
  let redisSetSpy: any;
  let redisExpireSpy: any;
  let redisLrangeSpy: any;
  let redisGetSpy: any;
  let redisHsetSpy: any;

  beforeEach(() => {
    const r = {
      set: mockRedisSet,
      expire: mockRedisExpire,
      lrange: mockRedisLrange,
      get: mockRedisGet,
      hset: mock().mockImplementation(() => Promise.resolve()),
    };

    getRedisClientSpy = spyOn(infraRedis, "getRedisClient").mockReturnValue(
      r as any
    );
    connectRedisSpy = spyOn(infraRedis, "connectRedis").mockResolvedValue(true);
    disconnectRedisSpy = spyOn(
      infraRedis,
      "disconnectRedis"
    ).mockImplementation(() => undefined);
    redisSetSpy = spyOn(infraRedis.redis, "set").mockImplementation(
      mockRedisSet
    );
    redisExpireSpy = spyOn(infraRedis.redis, "expire").mockImplementation(
      mockRedisExpire
    );
    redisLrangeSpy = spyOn(infraRedis.redis, "lrange").mockImplementation(
      mockRedisLrange
    );
    redisGetSpy = spyOn(infraRedis.redis, "get").mockImplementation(
      mockRedisGet
    );
    redisHsetSpy = spyOn(infraRedis.redis, "hset").mockImplementation(
      () => Promise.resolve() as any
    );

    (globalThis as any).s3SendMock = mockS3Send;
    mockS3Send.mockClear();
    mockRedisSet.mockClear();
    mockRedisExpire.mockClear();
    mockRedisLrange.mockClear();
    mockRedisGet.mockClear();
    mockPrismaMeetingFindUnique.mockClear();
    mockPrismaTranscriptUpsert.mockClear();
    mockSummaryQueueAdd.mockClear();
    mockAudioCleanupQueueAdd.mockClear();
    mockTranscribeAudioBuffer.mockClear();

    // Default mocks
    mockRedisSet.mockResolvedValue("OK");
    mockRedisExpire.mockResolvedValue(1);
    mockRedisLrange.mockResolvedValue([]);
    mockRedisGet.mockResolvedValue(null);
    mockPrismaMeetingFindUnique.mockResolvedValue({
      id: "meeting-1",
      participants: [
        {
          role: "HOST",
          user: { name: "Host Member" },
        },
      ],
      startedAt: new Date(0),
    });
    mockPrismaTranscriptUpsert.mockResolvedValue({});
    mockSummaryQueueAdd.mockResolvedValue({});
  });

  afterEach(() => {
    getRedisClientSpy.mockRestore();
    connectRedisSpy.mockRestore();
    disconnectRedisSpy.mockRestore();
    redisSetSpy.mockRestore();
    redisExpireSpy.mockRestore();
    redisLrangeSpy.mockRestore();
    redisGetSpy.mockRestore();
    redisHsetSpy.mockRestore();
    (globalThis as any).s3SendMock = undefined;
  });

  it("should successfully transcribe ch0 and ch1 and persist in Postgres", async () => {
    // S3 mock
    mockS3Send.mockImplementation((_cmd: any) => {
      return Promise.resolve({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(new Uint8Array([1, 2, 3])),
        },
      });
    });

    // Deepgram mock
    let callCount1 = 0;
    mockTranscribeAudioBuffer.mockImplementation((_buffer: Buffer) => {
      callCount1++;
      return Promise.resolve({
        utterances: [
          {
            start: 0,
            end: 2,
            text: callCount1 === 1 ? "Hello from mic" : "Hello from system",
            speaker: 0,
            confidence: 0.95,
          },
        ],
      });
    });

    const { TranscribeWorker } = await import("../src/transcribe.worker");
    const worker = new TranscribeWorker();

    const mockJob = {
      id: "job-1",
      data: {
        sessionId: "session-1",
        orgId: "org-1",
        meetingId: "meeting-1",
        s3Prefix: "org-1/session-1",
      },
    };

    const result = await (worker as any).process(mockJob);
    expect(result.success).toBe(true);

    // Verify S3 calls
    expect(mockS3Send).toHaveBeenCalledTimes(2);

    // Verify Deepgram calls
    expect(mockTranscribeAudioBuffer).toHaveBeenCalledTimes(2);

    // Verify status tracking in Redis
    expect(mockRedisSet).toHaveBeenCalledWith(
      "meeting.job.session-1.transcribe.status",
      "processing",
      "EX",
      86_400
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      "meeting.job.session-1.transcribe.status",
      "done",
      "EX",
      86_400
    );

    // Verify DB write
    expect(mockPrismaTranscriptUpsert).toHaveBeenCalledTimes(1);
    const dbArgs = mockPrismaTranscriptUpsert.mock.calls[0][0];
    expect(dbArgs.where.meetingId).toBe("meeting-1");
    expect(dbArgs.create.format).toBe("NORMALIZED");

    // Verify content structure (2 utterances sorted, Host Member for ch0, Speaker 0 for ch1)
    const content = JSON.parse(dbArgs.create.content);
    expect(content.length).toBe(2);
    expect(content[0].speaker).toBe("Host Member");
    expect(content[1].speaker).toBe("Speaker A");

    // Verify BullMQ chain
    expect(mockSummaryQueueAdd).toHaveBeenCalledWith("meeting.summary", {
      sessionId: "session-1",
      orgId: "org-1",
      meetingId: "meeting-1",
    });

    await worker.close();
  });

  it("should successfully reconcile batch output with live Redis transcript", async () => {
    // S3 mock
    mockS3Send.mockImplementation((_cmd: any) => {
      return Promise.resolve({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(new Uint8Array([1, 2, 3])),
        },
      });
    });

    // Deepgram mock for ch1 (remote)
    let callCount2 = 0;
    mockTranscribeAudioBuffer.mockImplementation((_buffer: Buffer) => {
      callCount2++;
      return Promise.resolve({
        utterances: [
          {
            start: callCount2 === 1 ? 0 : 1.5,
            end: callCount2 === 1 ? 2 : 3.5,
            text: callCount2 === 1 ? "Hello from mic" : "Hello from remote",
            speaker: 0,
            confidence: 0.95,
          },
        ],
      });
    });

    // Redis live transcript mock
    mockRedisLrange.mockResolvedValue([
      JSON.stringify({
        timestamp: 1.5,
        text: "Hello from remote",
        startOffset: 1.5,
        speaker: { name: "Alice Participant", type: "TEAM" },
      }),
    ]);

    const { TranscribeWorker } = await import("../src/transcribe.worker");
    const worker = new TranscribeWorker();

    const mockJob = {
      id: "job-1",
      data: {
        sessionId: "session-1",
        orgId: "org-1",
        meetingId: "meeting-1",
        s3Prefix: "org-1/session-1",
      },
    };

    const result = await (worker as any).process(mockJob);
    expect(result.success).toBe(true);

    const dbArgs = mockPrismaTranscriptUpsert.mock.calls[0][0];
    const content = JSON.parse(dbArgs.create.content);

    // Remote speaker should be mapped to "Alice Participant" due to overlap reconciliation
    expect(content.length).toBe(2);
    const remoteUtt = content.find((u: any) => u.channel === 1);
    expect(remoteUtt.speaker).toBe("Alice Participant");

    await worker.close();
  });

  it("should proceed gracefully with one channel if the other is missing in S3", async () => {
    // S3 mock returns noSuchKey for ch1
    mockS3Send.mockImplementation((cmd: any) => {
      if (cmd.input.Key.endsWith("ch1.pcm16")) {
        const error = new Error("NoSuchKey");
        error.name = "NoSuchKey";
        return Promise.reject(error);
      }
      return Promise.resolve({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(new Uint8Array([1, 2, 3])),
        },
      });
    });

    mockTranscribeAudioBuffer.mockImplementation((_buffer: Buffer) => {
      return Promise.resolve({
        utterances: [
          {
            start: 0,
            end: 2,
            text: "Hello from host",
            speaker: 0,
            confidence: 0.95,
          },
        ],
      });
    });

    const { TranscribeWorker } = await import("../src/transcribe.worker");
    const worker = new TranscribeWorker();

    const mockJob = {
      id: "job-1",
      data: {
        sessionId: "session-1",
        orgId: "org-1",
        meetingId: "meeting-1",
        s3Prefix: "org-1/session-1",
      },
    };

    const result = await (worker as any).process(mockJob);
    expect(result.success).toBe(true);

    // Verify S3 fetch attempts
    expect(mockS3Send).toHaveBeenCalledTimes(2);

    // Verify only one Deepgram transcription happened
    expect(mockTranscribeAudioBuffer).toHaveBeenCalledTimes(1);

    const dbArgs = mockPrismaTranscriptUpsert.mock.calls[0][0];
    const content = JSON.parse(dbArgs.create.content);
    expect(content.length).toBe(1);
    expect(content[0].speaker).toBe("Host Member");

    await worker.close();
  });

  it("should throw and set status to failed if both channels are missing in S3", async () => {
    // S3 mock returns noSuchKey for both
    mockS3Send.mockImplementation(() => {
      const error = new Error("NoSuchKey");
      error.name = "NoSuchKey";
      return Promise.reject(error);
    });

    const { TranscribeWorker } = await import("../src/transcribe.worker");
    const worker = new TranscribeWorker();

    const mockJob = {
      id: "job-1",
      data: {
        sessionId: "session-1",
        orgId: "org-1",
        meetingId: "meeting-1",
        s3Prefix: "org-1/session-1",
      },
    };

    let thrownError: Error | null = null;
    try {
      await (worker as any).process(mockJob);
    } catch (err: any) {
      thrownError = err as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError?.message).toContain("No audio files found in S3");

    expect(mockRedisSet).toHaveBeenCalledWith(
      "meeting.job.session-1.transcribe.status",
      "failed",
      "EX",
      86_400
    );

    await worker.close();
  });
});
