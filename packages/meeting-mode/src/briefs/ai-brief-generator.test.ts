import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AIBriefGeneratorService } from "./ai-brief-generator";

// Mock dependencies
const mockPrisma = {
  meeting: {
    findUnique: mock(),
    findMany: mock(),
    update: mock(),
  },
  task: {
    findMany: mock(),
  },
  openQuestion: {
    findMany: mock(),
  },
  importantPoint: {
    findMany: mock(),
  },
};

const mockRedis = {
  set: mock(),
  del: mock(),
  eval: mock(),
};

mock.module("@larity/infra/prisma/client", () => ({ prisma: mockPrisma }));
mock.module("@larity/infra/redis", () => ({
  getRedisClient: () => mockRedis,
}));

mock.module("@google/genai", () => {
  return {
    Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY" },
    GoogleGenAI: class {
      models = {
        generateContent: mock().mockResolvedValue({
          text: JSON.stringify({
            sentiment: "Positive",
            tldr: "This is a great brief.",
            suggestedAgenda: ["Discuss metrics", "Review roadmap"],
            landmines: [{ text: "Budget constraint", category: "CONSTRAINT" }],
          }),
        }),
      };
    },
  };
});

describe("AIBriefGeneratorService", () => {
  beforeEach(() => {
    mockPrisma.meeting.findUnique.mockClear();
    mockPrisma.meeting.findMany.mockClear();
    mockPrisma.meeting.update.mockClear();
    mockPrisma.task.findMany.mockClear();
    mockPrisma.openQuestion.findMany.mockClear();
    mockPrisma.importantPoint.findMany.mockClear();
    mockRedis.set.mockClear();
    mockRedis.del.mockClear();
    mockRedis.eval.mockClear();
  });

  describe("generateBriefData", () => {
    it("should generate a brief when given a valid meeting id", async () => {
      // Setup mock data
      const meetingId = "test-meeting-id";
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        clientId: "test-client",
        client: { name: "Test Corp" },
        participants: [
          { role: "HOST", userId: "user1" },
          { role: "PARTICIPANT", userId: "user2" },
        ],
      });

      mockPrisma.meeting.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([
        { id: "task1", title: "Task 1", assigneeId: "user1", status: "OPEN" },
        { id: "task2", title: "Task 2", assigneeId: "user2", status: "OPEN" },
      ]);
      mockPrisma.openQuestion.findMany.mockResolvedValue([]);
      mockPrisma.importantPoint.findMany.mockResolvedValue([]);

      const result = await AIBriefGeneratorService.generateBriefData(meetingId);

      expect(result).toBeDefined();
      expect(result.tldr).toBe("This is a great brief.");
      expect(result.sentiment).toBe("Positive");
      expect(result.suggestedAgenda).toHaveLength(2);
      expect(result.landmines).toHaveLength(1);

      // Verify that tasks are properly partitioned into 'mine' and 'theirs'
      expect(result.commitments.mine).toHaveLength(1);
      expect(result.commitments.mine[0].id).toBe("task1");
      expect(result.commitments.theirs).toHaveLength(1);
      expect(result.commitments.theirs[0].id).toBe("task2");
    });

    it("should throw an error if the meeting does not exist", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(null);

      await expect(
        AIBriefGeneratorService.generateBriefData("non-existent")
      ).rejects.toThrow("Meeting not found");
    });
  });

  describe("generateAndSaveBrief", () => {
    it("should acquire a lock, generate the brief, save it to DB, and release the lock", async () => {
      const meetingId = "test-meeting-2";

      // Mock Redis acquiring lock successfully
      mockRedis.set.mockResolvedValue("OK");

      // Mock DB for generation
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        clientId: "test-client",
        client: { name: "Test Corp" },
        participants: [{ role: "HOST", userId: "user1" }],
      });
      mockPrisma.meeting.findMany.mockResolvedValue([]);
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.openQuestion.findMany.mockResolvedValue([]);
      mockPrisma.importantPoint.findMany.mockResolvedValue([]);

      mockPrisma.meeting.update.mockResolvedValue({});

      const result =
        await AIBriefGeneratorService.generateAndSaveBrief(meetingId);

      expect(result).toBeDefined();
      expect(mockRedis.set).toHaveBeenCalledWith(
        `meeting:brief_lock:${meetingId}`,
        expect.any(String),
        "NX",
        "EX",
        60
      );
      expect(mockPrisma.meeting.update).toHaveBeenCalled();
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        `meeting:brief_lock:${meetingId}`,
        expect.any(String)
      );
    });

    it("should abort if lock cannot be acquired", async () => {
      const meetingId = "test-meeting-locked";

      // Mock Redis lock failed (null returned by NX)
      mockRedis.set.mockResolvedValue(null);

      const result =
        await AIBriefGeneratorService.generateAndSaveBrief(meetingId);
      expect(result).toBeNull();
      expect(mockPrisma.meeting.update).not.toHaveBeenCalled();
    });
  });
});
