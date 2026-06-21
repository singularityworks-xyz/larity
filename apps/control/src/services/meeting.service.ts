import { redis } from "@larity/infra/redis";
import { redisKeys } from "@larity/infra/redis/keys";
import { applyPagination } from "../lib/pagination";
import { prisma } from "../lib/prisma";
import type {
  CreateMeetingInput,
  MeetingExtractionInput,
  MeetingQueryInput,
  UpdateMeetingInput,
} from "../validators";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

function hasValidTranscript(
  transcript: { content: string; wordCount: number | null } | null | undefined
): boolean {
  if (!transcript) {
    return false;
  }
  if (transcript.wordCount !== null && transcript.wordCount !== undefined) {
    return transcript.wordCount > 0;
  }
  try {
    const utterances = JSON.parse(transcript.content);
    return Array.isArray(utterances) && utterances.length > 0;
  } catch {
    return false;
  }
}

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
      // biome-ignore lint/suspicious/noExplicitAny: prisma input type mismatch
      data: data as any,
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

  async getProcessingStatus(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { transcript: true },
    });

    if (!meeting) {
      return null;
    }

    const sessionId = await redis.get(redisKeys.meetingToSession(meetingId));

    if (sessionId) {
      return this.getActiveSessionStatus(meetingId, sessionId);
    }

    return this.getDbSessionStatus(meeting);
  },

  async getActiveSessionStatus(meetingId: string, sessionId: string) {
    const transcribeStatus =
      (await redis.get(redisKeys.meetingJobStatus(sessionId, "transcribe"))) ||
      "queued";
    const summaryStatus =
      (await redis.get(redisKeys.meetingJobStatus(sessionId, "summary"))) ||
      "queued";

    let overall = "processing";
    if (transcribeStatus === "done" && summaryStatus === "done") {
      overall = "complete";
    } else if (transcribeStatus === "failed" || summaryStatus === "failed") {
      overall = "failed";
    } else if (transcribeStatus === "queued" && summaryStatus === "queued") {
      overall = "queued";
    }

    let errorReason: "NO_TRANSCRIPT" | null = null;
    if (transcribeStatus === "failed" || summaryStatus === "failed") {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: {
          transcript: {
            select: {
              content: true,
              wordCount: true,
            },
          },
        },
      });
      if (!hasValidTranscript(meeting?.transcript)) {
        errorReason = "NO_TRANSCRIPT";
      }
    }

    return {
      meetingId,
      sessionId,
      steps: {
        transcribe: transcribeStatus,
        summary: summaryStatus,
      },
      overall,
      errorReason,
    };
  },

  // biome-ignore lint/suspicious/noExplicitAny: prisma include returns wider types
  getDbSessionStatus(meeting: any) {
    if (meeting.status === "ENDED") {
      const hasTranscript = hasValidTranscript(meeting.transcript);
      const transcribeStatus = hasTranscript ? "done" : "failed";
      const summaryStatus = meeting.summary ? "done" : "failed";
      const overall =
        transcribeStatus === "done" && summaryStatus === "done"
          ? "complete"
          : "failed";

      return {
        meetingId: meeting.id,
        sessionId: null,
        steps: {
          transcribe: transcribeStatus,
          summary: summaryStatus,
        },
        overall,
        errorReason: hasTranscript ? null : "NO_TRANSCRIPT",
      };
    }

    return {
      meetingId: meeting.id,
      sessionId: null,
      steps: {
        transcribe: "queued",
        summary: "queued",
      },
      overall: "queued",
      errorReason: null,
    };
  },

  async reprocessMeeting(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        client: {
          select: { orgId: true },
        },
        transcript: true,
      },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    let sessionId = await redis.get(redisKeys.meetingToSession(meetingId));

    const hasTranscript = hasValidTranscript(meeting.transcript);

    if (!sessionId && meeting.transcript) {
      try {
        const utterances = JSON.parse(meeting.transcript.content);
        if (
          Array.isArray(utterances) &&
          utterances.length > 0 &&
          utterances[0]?.id
        ) {
          const parts = utterances[0].id.split(":");
          if (parts.length > 0) {
            sessionId = parts[0];
          }
        }
      } catch {
        // ignore
      }
    }

    if (!sessionId) {
      if (!hasTranscript) {
        throw new Error(
          "Cannot reprocess meeting because transcripts are not available. This usually happens when the meeting did not have any transcription/audio (e.g. it was an accidental meeting)."
        );
      }
      throw new Error("Could not resolve session ID for meeting");
    }

    const orgId = meeting.client.orgId;

    if (meeting.transcript) {
      // Reprocess summary only
      const statusKey = redisKeys.meetingJobStatus(sessionId, "summary");
      await redis.set(statusKey, "queued", "EX", 24 * 60 * 60);

      const { summaryQueue } = await import("@larity/jobs");
      const job = await summaryQueue.add("meeting.summary", {
        meetingId,
        sessionId,
        orgId,
      });

      return {
        success: true,
        jobId: job.id,
        sessionId,
      };
    }
    // Reprocess from transcription step
    const transcribeStatusKey = redisKeys.meetingJobStatus(
      sessionId,
      "transcribe"
    );
    const summaryStatusKey = redisKeys.meetingJobStatus(sessionId, "summary");
    await redis.set(transcribeStatusKey, "queued", "EX", 24 * 60 * 60);
    await redis.set(summaryStatusKey, "queued", "EX", 24 * 60 * 60);

    const { transcribeQueue } = await import("@larity/jobs");
    const job = await transcribeQueue.add("meeting.transcribe", {
      meetingId,
      sessionId,
      orgId,
      s3Prefix: `${orgId}/${sessionId}`,
    });

    return {
      success: true,
      jobId: job.id,
      sessionId,
    };
  },

  async confirmSpeakerMapping(
    meetingIdOrSessionId: string,
    deepgramIndex: string,
    clientMemberId: string
  ) {
    let meetingId = meetingIdOrSessionId;
    const mappedMeetingId = await redis.hget(
      redisKeys.meetingSession(meetingIdOrSessionId),
      "meetingId"
    );
    if (mappedMeetingId) {
      meetingId = mappedMeetingId;
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        clientId: true,
      },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    // Load the target member and verify tenant boundaries
    const member = await prisma.clientMember.findUnique({
      where: { id: clientMemberId },
      select: { clientId: true },
    });

    if (!member) {
      throw new NotFoundError("Client member not found");
    }

    if (member.clientId !== meeting.clientId) {
      throw new ForbiddenError(
        "Client member does not belong to the meeting's client"
      );
    }

    const updatePayload = JSON.stringify({ [deepgramIndex]: clientMemberId });

    const result = await prisma.$queryRaw<unknown[]>`
      UPDATE meetings
      SET "speakerMappings" = COALESCE("speakerMappings", '{}'::jsonb) || ${updatePayload}::jsonb
      WHERE id = ${meetingId}
      RETURNING *
    `;

    if (!result || result.length === 0) {
      throw new Error("Meeting not found");
    }

    return result[0];
  },
};
