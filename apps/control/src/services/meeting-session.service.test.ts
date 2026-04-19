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
  decision: {
    findMany: mock(),
  },
  importantPoint: {
    findMany: mock(),
  },
  policyGuardrail: {
    findMany: mock(),
  },
  clientMember: {
    findMany: mock(),
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
    mockRedis.expire.mockReset();
    mockRedis.del.mockReset();
    mockPrisma.meeting.findUnique.mockReset();
    mockPrisma.meeting.update.mockReset();
    mockPrisma.decision.findMany.mockReset();
    mockPrisma.importantPoint.findMany.mockReset();
    mockPrisma.policyGuardrail.findMany.mockReset();
    mockPrisma.clientMember.findMany.mockReset();
    mockPrisma.user.findUnique.mockReset();
  });

  describe("start", () => {
    it("preloads context and stores it in Redis on session start", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        clientId,
        status: "SCHEDULED",
        title: "Weekly sync",
        agenda: "- Timeline\n- Budget",
        client: {
          id: clientId,
          name: "Acme Corp",
          orgId,
          org: {
            settings: {
              policyKeywords: ["internal roadmap", "future pricing"],
            },
          },
        },
      });

      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue("OK");
      mockRedis.hset.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);
      mockRedis.sadd.mockResolvedValue(1);

      mockPrisma.decision.findMany.mockResolvedValue([
        {
          id: "decision-1",
          title: "Delivery window",
          content: "Release before May 15",
          tags: ["timeline"],
          createdAt: new Date("2026-04-10T10:00:00.000Z"),
        },
      ]);
      mockPrisma.importantPoint.findMany
        .mockResolvedValueOnce([
          {
            id: "constraint-1",
            content: "Capacity capped at 60%",
            createdAt: new Date("2026-04-09T10:00:00.000Z"),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "commitment-1",
            content: "We will share a draft by Tuesday",
            createdAt: new Date("2026-04-08T10:00:00.000Z"),
          },
        ]);
      mockPrisma.policyGuardrail.findMany.mockResolvedValue([
        {
          id: "guardrail-1",
          name: "NDA terms",
          description: "Do not disclose internal roadmap",
          ruleType: "NDA",
          severity: "WARNING",
          keywords: ["nda", "roadmap"],
          pattern: "confidential",
          clientId: null,
        },
      ]);
      mockPrisma.clientMember.findMany.mockResolvedValue([
        { name: "John Client" },
      ]);
      mockPrisma.meeting.update.mockResolvedValue({
        id: meetingId,
        status: "LIVE",
      });

      const result = await meetingSessionService.start({ meetingId }, userId);

      expect(result.meetingId).toBe(meetingId);
      expect(mockRedis.set).toHaveBeenCalled();

      const contextSetCall = mockRedis.set.mock.calls.find((call) => {
        return (
          typeof call[0] === "string" && call[0].startsWith("meeting:context:")
        );
      });

      expect(contextSetCall).toBeDefined();

      if (contextSetCall) {
        const contextPayload = JSON.parse(contextSetCall[1] as string);
        expect(contextPayload.meetingId).toBe(meetingId);
        expect(contextPayload.clientId).toBe(clientId);
        expect(contextPayload.openDecisions).toHaveLength(1);
        expect(contextPayload.knownConstraints).toHaveLength(1);
        expect(contextPayload.priorCommitments).toHaveLength(1);
        expect(contextPayload.activePolicyGuardrails).toHaveLength(1);
        expect(contextPayload.clientNameList).toContain("Acme Corp");
        expect(contextPayload.clientNameList).toContain("John Client");
        expect(contextPayload.keywordBlocklists).toContain("nda");
        expect(contextPayload.keywordBlocklists).toContain("internal roadmap");
        expect(contextPayload.calendarAgendaItems).toEqual([
          "Timeline",
          "Budget",
        ]);
      }
    });
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

    it("should prevent a user from a different org from joining", () => {
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

    it("should throw if session does not exist", () => {
      mockRedis.hgetall.mockResolvedValue(null);

      expect(meetingSessionService.join(sessionId, userId)).rejects.toThrow(
        "Session not found"
      );
    });

    it("should throw if session is ended", () => {
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
      mockRedis.sismember.mockImplementation((_key, member) => {
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

  describe("scheduleCleanup", () => {
    it("also shortens cached context TTL during cleanup", async () => {
      mockRedis.srem.mockResolvedValue(1);
      mockRedis.del.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await meetingSessionService.scheduleCleanup(sessionId, meetingId);

      expect(mockRedis.expire).toHaveBeenCalledWith(
        redisKeys.meetingContext(sessionId),
        5 * 60
      );
    });
  });
});
