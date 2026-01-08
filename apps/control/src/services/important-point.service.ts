import { prisma } from '../lib/prisma';
import type { CreateImportantPointInput } from '../validators';

export const ImportantPointService = {
  async create(data: CreateImportantPointInput) {
    return prisma.importantPoint.create({
      data,
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.importantPoint.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findAll(query?: {
    clientId?: string;
    meetingId?: string;
    speakerId?: string;
    category?: string;
  }) {
    return prisma.importantPoint.findMany({
      where: {
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        speakerId: query?.speakerId,
        category: query?.category as
          | 'COMMITMENT'
          | 'CONSTRAINT'
          | 'INSIGHT'
          | 'WARNING'
          | 'RISK'
          | 'OPPORTUNITY'
          | undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Important points are immutable - no update method

  async delete(id: string) {
    return prisma.importantPoint.delete({
      where: { id },
    });
  },
};
