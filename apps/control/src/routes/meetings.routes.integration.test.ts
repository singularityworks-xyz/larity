import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { Elysia } from "elysia";

mock.module("../lib/auth", () => {
  return {
    auth: {
      api: {
        getSession: mock(async () => ({
          session: { id: "session-auth" },
          user: {
            id: "user-1",
            orgId: "org-1",
            role: "OWNER",
          },
        })),
      },
    },
  };
});

import { MeetingInsightsService, MeetingService } from "../services";
import { meetingsRoutes } from "./meetings.routes";

describe("meetingsRoutes integration for insights, processing status, and reprocessing", () => {
  const app = new Elysia().use(meetingsRoutes);
  const getInsightsSpy = spyOn(MeetingInsightsService, "getInsights");
  const getProcessingStatusSpy = spyOn(MeetingService, "getProcessingStatus");
  const reprocessMeetingSpy = spyOn(MeetingService, "reprocessMeeting");

  beforeEach(() => {
    getInsightsSpy.mockReset();
    getProcessingStatusSpy.mockReset();
    reprocessMeetingSpy.mockReset();
  });

  afterAll(() => {
    getInsightsSpy.mockRestore();
    getProcessingStatusSpy.mockRestore();
    reprocessMeetingSpy.mockRestore();
  });

  describe("GET /meetings/:id/insights", () => {
    it("should fetch all insights for a meeting successfully", async () => {
      const mockInsights = {
        decisions: [{ id: "dec-1", title: "Dec 1" }],
        tasks: [{ id: "task-1", title: "Task 1" }],
        openQuestions: [],
        importantPoints: [
          { id: "pt-1", content: "Point 1", category: "INSIGHT" },
        ],
      };
      getInsightsSpy.mockResolvedValue(mockInsights as any);

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/insights"
        )
      );

      const json = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.decisions).toHaveLength(1);
      expect(json.data.importantPoints).toHaveLength(1);
      expect(getInsightsSpy).toHaveBeenCalledWith(
        "77777777-7777-4777-a777-777777777777",
        {}
      );
    });

    it("should filter insights by category if provided", async () => {
      const mockInsights = {
        decisions: [],
        tasks: [],
        openQuestions: [],
        importantPoints: [
          { id: "pt-2", content: "Commitment 1", category: "COMMITMENT" },
        ],
      };
      getInsightsSpy.mockResolvedValue(mockInsights as any);

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/insights?category=COMMITMENT"
        )
      );

      const json = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(getInsightsSpy).toHaveBeenCalledWith(
        "77777777-7777-4777-a777-777777777777",
        {
          category: "COMMITMENT",
        }
      );
    });
  });

  describe("GET /meetings/:id/processing-status", () => {
    it("should return processing status when found", async () => {
      const mockStatus = {
        meetingId: "77777777-7777-4777-a777-777777777777",
        sessionId: "session-123",
        steps: {
          transcribe: "done",
          summary: "processing",
        },
        overall: "processing",
      };
      getProcessingStatusSpy.mockResolvedValue(mockStatus);

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/processing-status"
        )
      );

      const json = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.overall).toBe("processing");
      expect(json.data.steps.transcribe).toBe("done");
      expect(getProcessingStatusSpy).toHaveBeenCalledWith(
        "77777777-7777-4777-a777-777777777777"
      );
    });

    it("should return 404 when meeting status is not resolved", async () => {
      getProcessingStatusSpy.mockResolvedValue(null);

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/processing-status"
        )
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /meetings/:id/reprocess", () => {
    it("should successfully trigger reprocessing", async () => {
      const mockResult = {
        success: true,
        jobId: "job-reprocess-123",
        sessionId: "session-123",
      };
      reprocessMeetingSpy.mockResolvedValue(mockResult);

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/reprocess",
          {
            method: "POST",
          }
        )
      );

      const json = (await response.json()) as any;

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.jobId).toBe("job-reprocess-123");
      expect(reprocessMeetingSpy).toHaveBeenCalledWith(
        "77777777-7777-4777-a777-777777777777"
      );
    });

    it("should return 400 when reprocessing service throws error", async () => {
      reprocessMeetingSpy.mockRejectedValue(
        new Error("Cannot reprocess meeting without a transcript")
      );

      const response = await app.handle(
        new Request(
          "http://local/meetings/77777777-7777-4777-a777-777777777777/reprocess",
          {
            method: "POST",
          }
        )
      );

      const json = (await response.json()) as any;

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe("Cannot reprocess meeting without a transcript");
    });
  });
});
