import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

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

mock.module("../src/lib/gemini", () => ({
  ai: {
    models: {
      generateContent: mock().mockResolvedValue({
        text: JSON.stringify({
          tone: "confident",
          likes: ["coffee", "directness"],
        }),
      }),
    },
  },
}));

const mockPrismaClientMemberFindUnique = mock();
const mockPrismaClientMemberUpdate = mock();
const mockPrismaTranscriptFindUnique = mock();

mock.module("@larity/infra/prisma/client", () => ({
  prisma: {
    clientMember: {
      findUnique: mockPrismaClientMemberFindUnique,
      update: mockPrismaClientMemberUpdate,
    },
    transcript: {
      findUnique: mockPrismaTranscriptFindUnique,
    },
  },
}));

describe("ClientPersonaWorker", () => {
  let worker: any;

  beforeEach(async () => {
    const { ClientPersonaWorker } = await import(
      "../src/client-persona.worker"
    );
    worker = new ClientPersonaWorker();
    mockPrismaClientMemberFindUnique.mockReset();
    mockPrismaClientMemberUpdate.mockReset();
    mockPrismaTranscriptFindUnique.mockReset();
  });

  afterEach(async () => {
    await worker.close();
  });

  it("should extract persona from client utterances", async () => {
    mockPrismaClientMemberFindUnique.mockResolvedValue({
      id: "cm-1",
      name: "Alice",
      clientId: "client-1",
      email: "alice@client.com",
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      persona: null,
    } as any);

    mockPrismaTranscriptFindUnique.mockResolvedValue({
      id: "transcript-1",
      meetingId: "meeting-1",
      content: JSON.stringify([
        { speaker: "Alice", text: "I like directness and coffee." },
        { speaker: "Host", text: "Got it." },
      ]),
    } as any);

    mockPrismaClientMemberUpdate.mockResolvedValue({} as any);

    const result = await (worker as any).process({
      data: { clientMemberId: "cm-1", meetingId: "meeting-1" },
    });

    expect(result.success).toBe(true);
    expect(mockPrismaClientMemberFindUnique).toHaveBeenCalled();
    expect(mockPrismaTranscriptFindUnique).toHaveBeenCalled();
    expect(mockPrismaClientMemberUpdate).toHaveBeenCalledWith({
      where: { id: "cm-1" },
      data: {
        persona: {
          tone: "confident",
          likes: ["coffee", "directness"],
        },
      },
    });
  });

  it("should skip if client member not found", async () => {
    mockPrismaClientMemberFindUnique.mockResolvedValue(null);

    const result = await (worker as any).process({
      data: { clientMemberId: "cm-2", meetingId: "meeting-2" },
    });

    expect(result.success).toBe(false);
    expect(mockPrismaTranscriptFindUnique).not.toHaveBeenCalled();
    expect(mockPrismaClientMemberUpdate).not.toHaveBeenCalled();
  });

  it("should succeed without updating if no utterances for client member", async () => {
    mockPrismaClientMemberFindUnique.mockResolvedValue({
      id: "cm-1",
      name: "Alice",
    } as any);

    mockPrismaTranscriptFindUnique.mockResolvedValue({
      id: "transcript-1",
      meetingId: "meeting-1",
      content: JSON.stringify([
        { speaker: "Bob", text: "I like directness and coffee." },
      ]),
    } as any);

    const result = await (worker as any).process({
      data: { clientMemberId: "cm-1", meetingId: "meeting-1" },
    });

    expect(result.success).toBe(true);
    expect(mockPrismaClientMemberUpdate).not.toHaveBeenCalled();
  });
});
