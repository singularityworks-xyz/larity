import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";
import { AIBriefGeneratorService } from "meeting-mode";

// Mock dependencies BEFORE importing the router
const mockPrisma = {
  meeting: {
    findUnique: mock(),
    findMany: mock(),
  },
};

mock.module("../lib/prisma", () => ({ prisma: mockPrisma }));
mock.module("meeting-mode", () => ({
  AIBriefGeneratorService: {
    generateAndSaveBrief: mock(),
  },
}));

mock.module("../middleware/auth", () => ({
  requireAuth: new Elysia().derive(() => {
    return { user: { id: "test-user-id" } };
  }),
}));

const { meetingsRoutes } = await import("./meetings.routes");

describe("Meetings Routes - Pre Meeting Brief", () => {
  beforeEach(() => {
    mockPrisma.meeting.findUnique.mockClear();
    (AIBriefGeneratorService.generateAndSaveBrief as any).mockClear();
  });

  const app = new Elysia().use(meetingsRoutes);

  it("should return the pre-existing brief if it already exists", async () => {
    const meetingId = "123e4567-e89b-12d3-a456-426614174001";
    mockPrisma.meeting.findUnique.mockResolvedValue({
      id: meetingId,
      preMeetingBrief: { tldr: "Already exists", sentiment: "Positive" },
    });

    const response = await app.handle(
      new Request(`http://localhost/meetings/${meetingId}/brief`, {
        method: "GET",
      })
    );

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.tldr).toBe("Already exists");
    expect(AIBriefGeneratorService.generateAndSaveBrief).not.toHaveBeenCalled();
  });

  it("should dynamically generate the brief if it does not exist", async () => {
    const meetingId = "123e4567-e89b-12d3-a456-426614174002";
    mockPrisma.meeting.findUnique.mockResolvedValue({
      id: meetingId,
      preMeetingBrief: null, // missing
    });

    (AIBriefGeneratorService.generateAndSaveBrief as any).mockResolvedValue({
      tldr: "Freshly generated brief",
      sentiment: "Neutral",
    });

    const response = await app.handle(
      new Request(`http://localhost/meetings/${meetingId}/brief`, {
        method: "GET",
      })
    );

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.tldr).toBe("Freshly generated brief");
    expect(AIBriefGeneratorService.generateAndSaveBrief).toHaveBeenCalledWith(
      "123e4567-e89b-12d3-a456-426614174002",
      undefined
    );
  });

  it("should return 404 if the meeting is not found", async () => {
    const meetingId = "123e4567-e89b-12d3-a456-426614174003";
    mockPrisma.meeting.findUnique.mockResolvedValue(null);

    const response = await app.handle(
      new Request(`http://localhost/meetings/${meetingId}/brief`, {
        method: "GET",
      })
    );

    const result = await response.json();
    expect(response.status).toBe(404);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Meeting not found");
  });

  it("should return 500 if generation fails", async () => {
    const meetingId = "123e4567-e89b-12d3-a456-426614174004";
    mockPrisma.meeting.findUnique.mockResolvedValue({
      id: meetingId,
      preMeetingBrief: null,
    });

    (AIBriefGeneratorService.generateAndSaveBrief as any).mockResolvedValue(
      null
    );

    const response = await app.handle(
      new Request(`http://localhost/meetings/${meetingId}/brief`, {
        method: "GET",
      })
    );

    const result = await response.json();
    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to generate brief");
  });
});
