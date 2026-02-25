import { beforeEach, describe, expect, it, mock } from "bun:test";
import { redisKeys } from "@larity/packages/infra/redis/keys";
import { meetingSessionService } from "./meeting-session.service";

// Mock dependencies
const mockRedis = {
  get: mock(),
  set: mock(),
  hgetall: mock(),
  hset: mock(),
  hincrby: mock(),
  expire: mock(),
  sadd: mock(),
  srem: mock(),
  del: mock(),
  exists: mock(),
  sismember: mock(),
};

const mockPrisma = {
  meeting: {
    findUnique: mock(),
    update: mock(),
  },
  user: {
    findUnique: mock(),
  },
};

// Mock modules
mock.module("@larity/packages/infra/redis", () => ({
  redis: mockRedis,
}));

mock.module("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("MeetingSessionService", () => {
  const userId = "user-123";
  const orgId = "org-123";
  const meetingId = "meeting-123";
  const sessionId = "session-123";
  const clientId = "client-123";

  beforeEach(() => {
    // Reset mocks
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.hgetall.mockReset();
    mockRedis.hset.mockReset();
    mockRedis.sadd.mockReset();
    mockRedis.sismember.mockReset();
    mockPrisma.meeting.findUnique.mockReset();
    mockPrisma.user.findUnique.mockReset();
  });

  describe("join", () => {
    it("should allow a user from the same org to join", async () => {
      // Setup Redis mock for active session
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        meetingId,
        status: "active",
      });

      // Setup Prisma mocks
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        client: { orgId },
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
      });

      // Execute
      const result = await meetingSessionService.join(sessionId, userId);

      // Verify
      expect(result.success).toBe(true);
      expect(result.role).toBe("participant");
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        redisKeys.sessionParticipants(sessionId),
        userId
      );
    });

    it("should prevent a user from a different org from joining", async () => {
      // Setup Redis mock
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        meetingId,
        status: "active",
      });

      // Setup Prisma mocks (different orgs)
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        client: { orgId },
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId: "different-org",
      });

      // Execute & Verify
      expect(meetingSessionService.join(sessionId, userId)).rejects.toThrow(
        "Unauthorized to join this meeting"
      );
    });

    it("should throw if session does not exist", async () => {
      mockRedis.hgetall.mockResolvedValue(null);

      expect(meetingSessionService.join(sessionId, userId)).rejects.toThrow(
        "Session not found"
      );
    });

    it("should throw if session is ended", async () => {
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        meetingId,
        status: "ended",
      });

      expect(meetingSessionService.join(sessionId, userId)).rejects.toThrow(
        "Session has ended"
      );
    });
  });

  describe("isValidSession", () => {
    it("should validate a host correctly", async () => {
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        userId: "host-user",
        status: "active",
      });

      // Correct host
      const result1 = await meetingSessionService.isValidSession(
        sessionId,
        "host-user",
        "host"
      );
      expect(result1).toBe(true);

      // Incorrect host
      const result2 = await meetingSessionService.isValidSession(
        sessionId,
        "imposter",
        "host"
      );
      expect(result2).toBe(false);
    });

    it("should validate a participant correctly", async () => {
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        userId: "host-user",
        status: "active",
      });

      // Setup sismember for participants
      mockRedis.sismember.mockImplementation(async (key, member) => {
        return member === "valid-participant" ? 1 : 0;
      });

      // Valid participant
      const result1 = await meetingSessionService.isValidSession(
        sessionId,
        "valid-participant",
        "participant"
      );
      expect(result1).toBe(true);

      // Invalid participant
      const result2 = await meetingSessionService.isValidSession(
        sessionId,
        "random-user",
        "participant"
      );
      expect(result2).toBe(false);
    });

    it("should return false if validation params are missing", async () => {
      mockRedis.hgetall.mockResolvedValue({
        sessionId,
        status: "active",
      });

      const result = await meetingSessionService.isValidSession(sessionId);
      expect(result).toBe(false);
    });
  });
});
