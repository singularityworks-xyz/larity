import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock individual mock functions
const mockPrismaMeetingFindUnique = mock();
const mockPrismaTranscriptFindUnique = mock();
const mockPrismaQueryRaw = mock();
const mockPrismaExecuteRawUnsafe = mock();
const mockDecisionFindMany = mock();
const mockDecisionUpdate = mock();
const mockDecisionCreate = mock();
const mockDecisionDeleteMany = mock();
const mockTaskDeleteMany = mock();
const mockTaskCreate = mock();
const mockOpenQuestionDeleteMany = mock();
const mockOpenQuestionCreate = mock();
const mockImportantPointDeleteMany = mock();
const mockImportantPointCreate = mock();
const mockMeetingUpdate = mock();
const mockTranscriptUtteranceDeleteMany = mock();
const mockTranscriptUtteranceCreate = mock().mockResolvedValue({ id: "utt-1" });

const txMock = {
  decision: {
    findMany: mockDecisionFindMany,
    update: mockDecisionUpdate,
    create: mockDecisionCreate,
    deleteMany: mockDecisionDeleteMany,
  },
  task: {
    deleteMany: mockTaskDeleteMany,
    create: mockTaskCreate,
  },
  openQuestion: {
    deleteMany: mockOpenQuestionDeleteMany,
    create: mockOpenQuestionCreate,
  },
  importantPoint: {
    deleteMany: mockImportantPointDeleteMany,
    create: mockImportantPointCreate,
  },
  meeting: {
    update: mockMeetingUpdate,
  },
  $queryRaw: mockPrismaQueryRaw,
  $executeRawUnsafe: mockPrismaExecuteRawUnsafe,
};

// Mock Prisma client and transaction runner
mock.module("@larity/infra/prisma/client", () => ({
  prisma: {
    meeting: {
      findUnique: mockPrismaMeetingFindUnique,
    },
    transcript: {
      findUnique: mockPrismaTranscriptFindUnique,
    },
    transcriptUtterance: {
      deleteMany: mockTranscriptUtteranceDeleteMany,
      create: mockTranscriptUtteranceCreate,
    },
    $transaction: mock().mockImplementation(async (callback) => {
      return await callback(txMock);
    }),
    $queryRaw: mockPrismaQueryRaw,
    $executeRawUnsafe: mockPrismaExecuteRawUnsafe,
  },
}));

// Mock Redis client
const mockRedisGet = mock();
const mockRedisSet = mock().mockResolvedValue("OK");
const mockRedisPublish = mock().mockResolvedValue(1);
const mockRedisDel = mock().mockResolvedValue(1);
const mockRedisSrem = mock().mockResolvedValue(1);

mock.module("@larity/infra/redis", () => {
  const r = {
    get: mockRedisGet,
    set: mockRedisSet,
    publish: mockRedisPublish,
    del: mockRedisDel,
    srem: mockRedisSrem,
    expire: mock().mockResolvedValue(1),
  };
  return {
    redis: r,
    getRedisClient: () => r,
    connectRedis: () => Promise.resolve(true),
    disconnectRedis: () => {
      // noop
    },
  };
});

// Mock S3 Client
mock.module("@larity/infra/s3", () => ({
  createS3Client: () => ({
    send: () => Promise.resolve({ Body: null }),
    destroy: () => {
      // noop
    },
  }),
  GetObjectCommand: class {},
  getS3Config: () => ({ bucket: "test" }),
}));

// Mock LLM generation
const mockExtractInsights = mock();
const mockGenerateEmbedding = mock();
mock.module("../src/lib/extraction-llm", () => ({
  extractInsightsFromTranscriptChunk: mockExtractInsights,
  EXTRACTION_MODEL: "gemini-3.1-flash-lite",
}));

mock.module("../src/lib/embeddings", () => ({
  generateEmbedding: mockGenerateEmbedding,
}));

// Mock BullMQ Worker
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
}));

describe("SummaryWorker Integration", () => {
  beforeEach(() => {
    mockPrismaMeetingFindUnique.mockClear();
    mockPrismaTranscriptFindUnique.mockClear();
    mockPrismaQueryRaw.mockClear();
    mockPrismaExecuteRawUnsafe.mockClear();
    mockDecisionFindMany.mockClear();
    mockDecisionUpdate.mockClear();
    mockDecisionCreate.mockClear();
    mockDecisionDeleteMany.mockClear();
    mockTaskDeleteMany.mockClear();
    mockTaskCreate.mockClear();
    mockOpenQuestionDeleteMany.mockClear();
    mockOpenQuestionCreate.mockClear();
    mockImportantPointDeleteMany.mockClear();
    mockImportantPointCreate.mockClear();
    mockMeetingUpdate.mockClear();
    mockRedisGet.mockClear();
    mockExtractInsights.mockClear();
    mockGenerateEmbedding.mockClear();
    mockTranscriptUtteranceDeleteMany.mockClear();
    mockTranscriptUtteranceCreate.mockClear();
  });

  it("should process transcript, extract insights, and transactionally save to DB", async () => {
    const { SummaryWorker } = await import("../src/summary.worker");

    // 1. Mock DB retrieves
    mockPrismaMeetingFindUnique.mockResolvedValue({
      id: "meeting-1",
      title: "Product Sync",
      clientId: "client-1",
      client: { name: "Singularity Works" },
      participants: [
        { user: { id: "user-1", name: "Alice" } },
        { externalName: "Bob" },
      ],
    });

    const mockUtterances = [
      {
        id: "u-1",
        speaker: "Alice",
        text: "We decided to build with TypeScript.",
        timestamp: 10,
        duration: 5,
        channel: 0,
      },
      {
        id: "u-2",
        speaker: "Bob",
        text: "Can you finish the database migration by Friday?",
        timestamp: 50,
        duration: 6,
        channel: 1,
      },
      {
        id: "u-3",
        speaker: "Alice",
        text: "Yes, I will get it done.",
        timestamp: 60,
        duration: 4,
        channel: 0,
      },
    ];

    mockPrismaTranscriptFindUnique.mockResolvedValue({
      id: "transcript-1",
      meetingId: "meeting-1",
      content: JSON.stringify(mockUtterances),
    });

    // 2. Mock LLM returns
    mockExtractInsights.mockResolvedValue({
      decisions: [
        {
          title: "Use TypeScript",
          content: "Adopt TypeScript for primary codebase",
          tags: ["tech-stack"],
        },
      ],
      tasks: [
        {
          title: "Database migration",
          description: "Complete database schemas",
          assigneeHint: "Alice",
          dueAt: "2026-06-05T00:00:00.000Z",
          priority: "HIGH",
        },
      ],
      openQuestions: [],
      importantPoints: [
        {
          content: "Project must deploy on AWS",
          category: "CONSTRAINT",
          speakerHint: "Bob",
        },
      ],
    });

    // Mock embedding generations
    mockGenerateEmbedding.mockResolvedValue(new Array(768).fill(0.1));

    // Mock redis commitments (empty array)
    mockRedisGet.mockResolvedValue(null);

    // Mock version check: no existing decisions
    mockDecisionFindMany.mockResolvedValue([]);

    // Mock created objects
    mockDecisionCreate.mockResolvedValue({ id: "dec-new-1" });
    mockImportantPointCreate.mockResolvedValue({ id: "point-new-1" });

    // Mock overview summarization
    const { ai } = await import("../src/lib/gemini");
    const originalGenerateContent = ai.models.generateContent;
    ai.models.generateContent = mock().mockResolvedValue({
      text: JSON.stringify({
        purpose: "Define the implementation timeline.",
        outcome: "Approved the plan.",
        prose: "A detailed paragraph summarizing what happened.",
        tone: "POSITIVE",
        clientSentiment: "ENTHUSIASTIC",
        keyMoments: [
          {
            timestamp: 45,
            description: "Richard agreed to plan",
            category: "DECISION",
          },
        ],
      }),
    }) as any;

    // 3. Execute Worker
    const worker = new SummaryWorker();
    try {
      const result = await (worker as any).process({
        id: "job-summary-1",
        data: {
          meetingId: "meeting-1",
          sessionId: "session-1",
          orgId: "org-1",
        },
      });

      expect(result.success).toBe(true);

      // Verify DB deletes & inserts
      expect(mockPrismaMeetingFindUnique).toHaveBeenCalledWith({
        where: { id: "meeting-1" },
        include: {
          participants: { include: { user: true } },
          client: true,
        },
      });

      expect(mockDecisionDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockDecisionCreate).toHaveBeenCalledTimes(1);
      expect(mockTaskCreate).toHaveBeenCalledTimes(1);
      expect(mockOpenQuestionCreate).toHaveBeenCalledTimes(0); // none returned
      expect(mockImportantPointCreate).toHaveBeenCalledTimes(1); // constraint

      // Verify the task matches the resolved assigneeId ("user-1" for Alice)
      const taskCall = mockTaskCreate.mock.calls[0][0];
      expect(taskCall.data.assigneeId).toBe("user-1");
      expect(taskCall.data.title).toBe("Database migration");

      // Verify raw pgvector updates
      expect(mockPrismaExecuteRawUnsafe).toHaveBeenCalled();

      // Verify meeting summary update
      expect(mockMeetingUpdate).toHaveBeenCalledWith({
        where: { id: "meeting-1" },
        data: {
          summary: expect.objectContaining({
            purpose: "Define the implementation timeline.",
            outcome: "Approved the plan.",
            prose: "A detailed paragraph summarizing what happened.",
            tone: "POSITIVE",
            clientSentiment: "ENTHUSIASTIC",
            keyMoments: expect.any(Array),
            speakers: expect.any(Array),
            durationSeconds: expect.any(Number),
            participantCount: expect.any(Number),
            generatedAt: expect.any(String),
          }),
        },
      });
    } finally {
      // Cleanup mock overrides
      ai.models.generateContent = originalGenerateContent;
      await worker.close();
    }
  });
});
