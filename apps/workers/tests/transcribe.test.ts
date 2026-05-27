import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockS3Send = mock();
const mockRedisSet = mock();
const mockRedisExpire = mock();
const mockRedisLrange = mock();
const mockPrismaMeetingFindUnique = mock();
const mockPrismaTranscriptUpsert = mock();
const mockSummaryQueueAdd = mock();
const mockTranscribeAudioBuffer = mock();

// Mock modules
mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class MockS3Client {
    send(cmd: any) {
      if ((globalThis as any).s3SendMock) {
        return (globalThis as any).s3SendMock(cmd);
      }
      return Promise.resolve({});
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
}));

mock.module("@larity/infra/redis", () => ({
  getRedisClient: () => ({
    set: mockRedisSet,
    expire: mockRedisExpire,
    lrange: mockRedisLrange,
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
    getJobCounts() {
      return Promise.resolve({
        active: 0,
        waiting: 0,
        failed: 0,
        completed: 0,
      });
    }
  },
  Queue: class MockQueue {
    add = mockSummaryQueueAdd;
  },
}));

mock.module("@larity/jobs", () => ({
  summaryQueue: {
    add: mockSummaryQueueAdd,
  },
}));

mock.module("@larity/stt", () => ({
  transcribeAudioBuffer: mockTranscribeAudioBuffer,
}));

describe("TranscribeWorker", () => {
  beforeEach(() => {
    (globalThis as any).s3SendMock = mockS3Send;
    mockS3Send.mockClear();
    mockRedisSet.mockClear();
    mockRedisExpire.mockClear();
    mockRedisLrange.mockClear();
    mockPrismaMeetingFindUnique.mockClear();
    mockPrismaTranscriptUpsert.mockClear();
    mockSummaryQueueAdd.mockClear();
    mockTranscribeAudioBuffer.mockClear();

    // Default mocks
    mockRedisSet.mockResolvedValue("OK");
    mockRedisExpire.mockResolvedValue(1);
    mockRedisLrange.mockResolvedValue([]);
    mockPrismaMeetingFindUnique.mockResolvedValue({
      id: "meeting-1",
      participants: [
        {
          role: "HOST",
          user: { name: "Host Member" },
        },
      ],
    });
    mockPrismaTranscriptUpsert.mockResolvedValue({});
    mockSummaryQueueAdd.mockResolvedValue({});
  });

  afterEach(() => {
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
    mockTranscribeAudioBuffer.mockImplementation((_buffer: Buffer) => {
      return Promise.resolve({
        utterances: [
          {
            start: 0,
            end: 2,
            text: "Hello from buffer",
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
      "processing"
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      "meeting.job.session-1.transcribe.status",
      "done"
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
    expect(content[1].speaker).toBe("Speaker 0");

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
    mockTranscribeAudioBuffer.mockImplementation((_buffer: Buffer) => {
      return Promise.resolve({
        utterances: [
          {
            start: 1.5,
            end: 3.5,
            text: "Hello from remote",
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
        speaker: { name: "Alice Participant" },
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

    expect((worker as any).process(mockJob)).rejects.toThrow(
      "No audio files found in S3"
    );

    // Verify status tracking sets "failed"
    // Wait for the async process to run and reject to ensure set is called
    try {
      await (worker as any).process(mockJob);
    } catch {
      // expected
    }

    expect(mockRedisSet).toHaveBeenCalledWith(
      "meeting.job.session-1.transcribe.status",
      "failed"
    );

    await worker.close();
  });
});
