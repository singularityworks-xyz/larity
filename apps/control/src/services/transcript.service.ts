import { isPrismaError, PrismaErrorCode } from "../lib/errors";
import { prisma } from "../lib/prisma";
import type {
  CreateTranscriptInput,
  UpdateTranscriptInput,
} from "../validators";

export const TranscriptService = {
  async create(orgId: string, data: CreateTranscriptInput) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: data.meetingId, client: { orgId } },
    });
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    // Use try/catch with unique constraint instead of check-then-create
    // This avoids race condition where two concurrent requests could both pass a check
    try {
      return await prisma.transcript.create({
        data,
        include: {
          meeting: { select: { id: true, title: true, clientId: true } },
        },
      });
    } catch (e) {
      if (isPrismaError(e) && e.code === PrismaErrorCode.UNIQUE_CONSTRAINT) {
        throw new Error("Transcript already exists for this meeting");
      }
      throw e;
    }
  },

  findById(id: string, orgId: string) {
    return prisma.transcript.findFirst({
      where: { id, meeting: { client: { orgId } } },
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  findByMeeting(meetingId: string, orgId: string) {
    return prisma.transcript.findFirst({
      where: { meetingId, meeting: { client: { orgId } } },
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  async update(id: string, orgId: string, data: UpdateTranscriptInput) {
    const existing = await prisma.transcript.findFirst({
      where: { id, meeting: { client: { orgId } } },
    });
    if (!existing) {
      throw new Error("Transcript not found");
    }
    return prisma.transcript.update({
      where: { id },
      data,
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.transcript.findFirst({
      where: { id, meeting: { client: { orgId } } },
    });
    if (!existing) {
      throw new Error("Transcript not found");
    }
    return prisma.transcript.delete({
      where: { id },
    });
  },
};
