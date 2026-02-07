import { applyPagination } from "../lib/pagination";
import { prisma } from "../lib/prisma";
import type {
  CreateMeetingInput,
  MeetingExtractionInput,
  MeetingQueryInput,
  UpdateMeetingInput,
} from "../validators";

export const MeetingService = {
  create(data: CreateMeetingInput) {
    return prisma.meeting.create({
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  findById(id: string) {
    return prisma.meeting.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        transcript: true,
        tasks: {
          include: {
            assignee: { select: { id: true, name: true } },
          },
        },
        decisions: {
          orderBy: { version: "desc" },
        },
        openQuestions: {
          include: {
            assignee: { select: { id: true, name: true } },
          },
        },
        importantPoints: {
          include: {
            speaker: { select: { id: true, name: true } },
          },
        },
      },
    });
  },

  findAll(query?: MeetingQueryInput) {
    return prisma.meeting.findMany({
      where: {
        clientId: query?.clientId,
        status: query?.status as
          | "SCHEDULED"
          | "LIVE"
          | "ENDED"
          | "CANCELLED"
          | undefined,
        scheduledAt: {
          ...(query?.scheduledAfter && { gte: query.scheduledAfter }),
          ...(query?.scheduledBefore && { lte: query.scheduledBefore }),
        },
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            participants: true,
            tasks: true,
            decisions: true,
            openQuestions: true,
            importantPoints: true,
          },
        },
      },
      orderBy: { scheduledAt: "desc" },
      ...applyPagination(query),
    });
  },

  update(id: string, data: UpdateMeetingInput) {
    return prisma.meeting.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  delete(id: string) {
    return prisma.meeting.delete({
      where: { id },
    });
  },

  async startMeeting(id: string) {
    // Validate status transition: only SCHEDULED meetings can be started
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    if (meeting.status !== "SCHEDULED") {
      throw new Error(
        `Cannot start meeting with status '${meeting.status}'. Only SCHEDULED meetings can be started.`
      );
    }

    return prisma.meeting.update({
      where: { id },
      data: {
        status: "LIVE",
        startedAt: new Date(),
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
  },

  async endMeeting(id: string) {
    // Validate status transition: only LIVE meetings can be ended
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    if (meeting.status !== "LIVE") {
      throw new Error(
        `Cannot end meeting with status '${meeting.status}'. Only LIVE meetings can be ended.`
      );
    }

    return prisma.meeting.update({
      where: { id },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async cancelMeeting(id: string) {
    // Validate status transition: only SCHEDULED meetings can be cancelled
    const meeting = await prisma.meeting.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    if (meeting.status !== "SCHEDULED") {
      throw new Error(
        `Cannot cancel meeting with status '${meeting.status}'. Only SCHEDULED meetings can be cancelled.`
      );
    }

    return prisma.meeting.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  },

  // Bulk extraction endpoint for post-meeting processing
  async extractFromMeeting(meetingId: string, data: MeetingExtractionInput) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { clientId: true },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const { clientId } = meeting;

    // Use transaction for atomic creation
    return prisma.$transaction(async (tx) => {
      // Create decisions
      const decisions = await Promise.all(
        data.decisions.map((d) =>
          tx.decision.create({
            data: {
              clientId,
              meetingId,
              title: d.title,
              content: d.content,
              rationale: d.rationale,
              evidence: d.evidence,
              // TODO v2: Add authorId field to track decision authorship
              tags: d.tags,
            },
          })
        )
      );

      // Create tasks
      const tasks = await Promise.all(
        data.tasks.map((t) =>
          tx.task.create({
            data: {
              clientId,
              meetingId,
              title: t.title,
              description: t.description,
              assigneeId: t.assigneeId,
              dueAt: t.dueAt,
              priority: t.priority,
            },
          })
        )
      );

      // Create open questions
      const openQuestions = await Promise.all(
        data.openQuestions.map((q) =>
          tx.openQuestion.create({
            data: {
              clientId,
              meetingId,
              question: q.question,
              context: q.context,
              assigneeId: q.assigneeId,
              dueAt: q.dueAt,
            },
          })
        )
      );

      // Create important points
      const importantPoints = await Promise.all(
        data.importantPoints.map((p) =>
          tx.importantPoint.create({
            data: {
              clientId,
              meetingId,
              content: p.content,
              category: p.category,
              speakerId: p.speakerId,
              transcriptEvidence: p.transcriptEvidence,
            },
          })
        )
      );

      // Update meeting summary if provided
      if (data.summary) {
        await tx.meeting.update({
          where: { id: meetingId },
          data: { summary: data.summary },
        });
      }

      return {
        decisions,
        tasks,
        openQuestions,
        importantPoints,
        summary: data.summary,
      };
    });
  },
};
