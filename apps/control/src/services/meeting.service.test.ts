import { beforeEach, describe, expect, it, mock } from "bun:test";
import { redisKeys } from "@larity/infra/redis/keys";
import { MeetingService } from "./meeting.service";

// Mock dependencies
const mockRedis = {
  get: mock(),
  set: mock(),
  hget: mock(),
  hgetall: mock(),
  hset: mock(),
  expire: mock(),
  sadd: mock(),
  srem: mock(),
  del: mock(),
};

const mockPrisma = {
  meeting: {
    findUnique: mock(),
    update: mock(),
  },
};

const mockSummaryQueueAdd = mock();
const mockTranscribeQueueAdd = mock();

// Mock modules
mock.module("@larity/infra/redis", () => ({
  redis: mockRedis,
}));

mock.module("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

mock.module("@larity/jobs", () => ({
  summaryQueue: {
    add: mockSummaryQueueAdd,
  },
  transcribeQueue: {
    add: mockTranscribeQueueAdd,
  },
}));

describe("MeetingService reprocessing and status check", () => {
  const meetingId = "meeting-123";
  const sessionId = "session-123";
  const orgId = "org-123";

  beforeEach(() => {
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.del.mockReset();
    mockPrisma.meeting.findUnique.mockReset();
    mockSummaryQueueAdd.mockReset();
    mockTranscribeQueueAdd.mockReset();
  });

  describe("getProcessingStatus", () => {
    it("returns active status from Redis if sessionId is in mapping", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        status: "ENDED",
      });
      mockRedis.get.mockImplementation((key) => {
        if (key === redisKeys.meetingToSession(meetingId)) {
          return Promise.resolve(sessionId);
        }
        if (key === redisKeys.meetingJobStatus(sessionId, "transcribe")) {
          return Promise.resolve("done");
        }
        if (key === redisKeys.meetingJobStatus(sessionId, "summary")) {
          return Promise.resolve("processing");
        }
        return Promise.resolve(null);
      });

      const res = await MeetingService.getProcessingStatus(meetingId);
      expect(res).toEqual({
        meetingId,
        sessionId,
        steps: {
          transcribe: "done",
          summary: "processing",
        },
        overall: "processing",
      });
    });

    it("falls back to database status if sessionId is not found", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        status: "ENDED",
        transcript: { id: "transcript-1" },
        summary: null,
      });
      mockRedis.get.mockResolvedValue(null);

      const res = await MeetingService.getProcessingStatus(meetingId);
      expect(res).toEqual({
        meetingId,
        sessionId: null,
        steps: {
          transcribe: "done",
          summary: "failed",
        },
        overall: "failed",
      });
    });
  });

  describe("reprocessMeeting", () => {
    it("throws an error if meeting is not found", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue(null);

      await expect(MeetingService.reprocessMeeting(meetingId)).rejects.toThrow(
        "Meeting not found"
      );
    });

    it("reprocesses summary directly if transcript exists and sessionId is resolved", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        client: { orgId },
        transcript: {
          content: JSON.stringify([{ id: `${sessionId}:ch0:0-10` }]),
        },
      });
      mockRedis.get.mockResolvedValue(sessionId);
      mockSummaryQueueAdd.mockResolvedValue({ id: "job-sum" });

      const res = await MeetingService.reprocessMeeting(meetingId);
      expect(res).toEqual({
        success: true,
        jobId: "job-sum",
        sessionId,
      });

      expect(mockSummaryQueueAdd).toHaveBeenCalledWith("meeting.summary", {
        meetingId,
        sessionId,
        orgId,
      });
      expect(mockTranscribeQueueAdd).not.toHaveBeenCalled();
    });

    it("reprocesses transcription if transcript does not exist and sessionId is in Redis", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        client: { orgId },
        transcript: null,
      });
      mockRedis.get.mockResolvedValue(sessionId);
      mockTranscribeQueueAdd.mockResolvedValue({ id: "job-tx" });

      const res = await MeetingService.reprocessMeeting(meetingId);
      expect(res).toEqual({
        success: true,
        jobId: "job-tx",
        sessionId,
      });

      expect(mockTranscribeQueueAdd).toHaveBeenCalledWith(
        "meeting.transcribe",
        {
          meetingId,
          sessionId,
          orgId,
          s3Prefix: `${orgId}/${sessionId}`,
        }
      );
      expect(mockSummaryQueueAdd).not.toHaveBeenCalled();
    });

    it("throws if transcript does not exist and sessionId is not found in Redis", async () => {
      mockPrisma.meeting.findUnique.mockResolvedValue({
        id: meetingId,
        client: { orgId },
        transcript: null,
      });
      mockRedis.get.mockResolvedValue(null);

      await expect(MeetingService.reprocessMeeting(meetingId)).rejects.toThrow(
        "Could not resolve session ID for meeting"
      );
    });
  });
});
