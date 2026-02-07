import { isPrismaError, PrismaErrorCode } from "../lib/errors";
import { prisma } from "../lib/prisma";
import type {
  CreateTranscriptInput,
  UpdateTranscriptInput,
} from "../validators";

export const TranscriptService = {
  async create(data: CreateTranscriptInput) {
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

  findById(id: string) {
    return prisma.transcript.findUnique({
      where: { id },
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  findByMeeting(meetingId: string) {
    return prisma.transcript.findUnique({
      where: { meetingId },
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  update(id: string, data: UpdateTranscriptInput) {
    return prisma.transcript.update({
      where: { id },
      data,
      include: {
        meeting: { select: { id: true, title: true, clientId: true } },
      },
    });
  },

  delete(id: string) {
    return prisma.transcript.delete({
      where: { id },
    });
  },
};
