import { prisma } from "../lib/prisma";
import type {
  CreateOpenQuestionInput,
  UpdateOpenQuestionInput,
} from "../validators";

export const OpenQuestionService = {
  async create(orgId: string, data: CreateOpenQuestionInput) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, orgId },
    });
    if (!client) {
      throw new Error("Client not found or access denied");
    }

    return prisma.openQuestion.create({
      data,
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolvedByDecision: {
          select: { id: true, title: true, decisionRef: true },
        },
      },
    });
  },

  findAll(
    orgId: string,
    query?: {
      clientId?: string;
      meetingId?: string;
      assigneeId?: string;
      status?: string;
    }
  ) {
    return prisma.openQuestion.findMany({
      where: {
        client: { orgId },
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        assigneeId: query?.assigneeId,
        status: query?.status as "OPEN" | "RESOLVED" | "DEFERRED" | undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  async update(id: string, orgId: string, data: UpdateOpenQuestionInput) {
    const existing = await prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Open question not found");
    }
    return prisma.openQuestion.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolvedByDecision: {
          select: { id: true, title: true, decisionRef: true },
        },
      },
    });
  },

  async resolve(id: string, orgId: string, decisionId?: string) {
    const existing = await prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Open question not found");
    }
    return prisma.openQuestion.update({
      where: { id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedByDecisionId: decisionId,
      },
      include: {
        resolvedByDecision: {
          select: { id: true, title: true, decisionRef: true },
        },
      },
    });
  },

  async defer(id: string, orgId: string) {
    const existing = await prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Open question not found");
    }
    return prisma.openQuestion.update({
      where: { id },
      data: { status: "DEFERRED" },
    });
  },

  async reopen(id: string, orgId: string) {
    const existing = await prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Open question not found");
    }
    return prisma.openQuestion.update({
      where: { id },
      data: {
        status: "OPEN",
        resolvedAt: null,
        resolvedByDecisionId: null,
      },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.openQuestion.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Open question not found");
    }
    return prisma.openQuestion.delete({
      where: { id },
    });
  },
};
