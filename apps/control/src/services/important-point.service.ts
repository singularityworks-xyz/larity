import { prisma } from "../lib/prisma";
import type { CreateImportantPointInput } from "../validators";

export const ImportantPointService = {
  async create(orgId: string, data: CreateImportantPointInput) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, orgId },
    });
    if (!client) {
      throw new Error("Client not found or access denied");
    }

    return prisma.importantPoint.create({
      data,
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.importantPoint.findFirst({
      where: { id, client: { orgId } },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findAll(
    orgId: string,
    query?: {
      clientId?: string;
      meetingId?: string;
      speakerId?: string;
      category?: string;
    }
  ) {
    return prisma.importantPoint.findMany({
      where: {
        client: { orgId },
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        speakerId: query?.speakerId,
        category: query?.category as
          | "COMMITMENT"
          | "CONSTRAINT"
          | "INSIGHT"
          | "WARNING"
          | "RISK"
          | "OPPORTUNITY"
          | undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        speaker: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  // Important points are immutable - no update method

  async delete(id: string, orgId: string) {
    const existing = await prisma.importantPoint.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Important point not found");
    }
    return prisma.importantPoint.delete({
      where: { id },
    });
  },
};
