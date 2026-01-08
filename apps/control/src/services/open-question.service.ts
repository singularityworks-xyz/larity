import { prisma } from '../lib/prisma';
import type { CreateOpenQuestionInput, UpdateOpenQuestionInput } from '../validators';

export const OpenQuestionService = {
  async create(data: CreateOpenQuestionInput) {
    return prisma.openQuestion.create({
      data,
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.openQuestion.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolvedByDecision: { select: { id: true, title: true, decisionRef: true } },
      },
    });
  },

  async findAll(query?: {
    clientId?: string;
    meetingId?: string;
    assigneeId?: string;
    status?: string;
  }) {
    return prisma.openQuestion.findMany({
      where: {
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        assigneeId: query?.assigneeId,
        status: query?.status as 'OPEN' | 'RESOLVED' | 'DEFERRED' | undefined,
      },
      include: {
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateOpenQuestionInput) {
    return prisma.openQuestion.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
        resolvedByDecision: { select: { id: true, title: true, decisionRef: true } },
      },
    });
  },

  async resolve(id: string, decisionId?: string) {
    return prisma.openQuestion.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedByDecisionId: decisionId,
      },
      include: {
        resolvedByDecision: { select: { id: true, title: true, decisionRef: true } },
      },
    });
  },

  async defer(id: string) {
    return prisma.openQuestion.update({
      where: { id },
      data: { status: 'DEFERRED' },
    });
  },

  async reopen(id: string) {
    return prisma.openQuestion.update({
      where: { id },
      data: {
        status: 'OPEN',
        resolvedAt: null,
        resolvedByDecisionId: null,
      },
    });
  },

  async delete(id: string) {
    return prisma.openQuestion.delete({
      where: { id },
    });
  },
};
