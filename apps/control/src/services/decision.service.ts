import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import type { CreateDecisionInput, ReviseDecisionInput } from '../validators';

export const DecisionService = {
  async create(data: CreateDecisionInput) {
    return prisma.decision.create({
      data: {
        decisionRef: randomUUID(),
        version: 1,
        clientId: data.clientId,
        title: data.title,
        content: data.content,
        rationale: data.rationale,
        evidence: data.evidence,
        meetingId: data.meetingId,
        tags: data.tags,
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  async createRevision(decisionRef: string, data: ReviseDecisionInput) {
    const latest = await prisma.decision.findFirst({
      where: { decisionRef },
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      throw new Error('Decision not found');
    }

    // Mark previous version as superseded
    await prisma.decision.update({
      where: { id: latest.id },
      data: { status: 'SUPERSEDED' },
    });

    return prisma.decision.create({
      data: {
        decisionRef,
        version: latest.version + 1,
        clientId: latest.clientId,
        title: data.title ?? latest.title,
        content: data.content ?? latest.content,
        rationale: data.rationale ?? latest.rationale,
        evidence: data.evidence ?? latest.evidence,
        meetingId: latest.meetingId,
        tags: data.tags ?? latest.tags,
        status: 'ACTIVE',
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.decision.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        tasks: { select: { id: true, title: true, status: true } },
        resolvedQuestions: { select: { id: true, question: true } },
      },
    });
  },

  async findLatestByRef(decisionRef: string) {
    return prisma.decision.findFirst({
      where: { decisionRef },
      orderBy: { version: 'desc' },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        tasks: { select: { id: true, title: true, status: true } },
      },
    });
  },

  async findAllVersions(decisionRef: string) {
    return prisma.decision.findMany({
      where: { decisionRef },
      orderBy: { version: 'desc' },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  async findByRefAndVersion(decisionRef: string, version: number) {
    return prisma.decision.findUnique({
      where: { decisionRef_version: { decisionRef, version } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  async findAll(query?: {
    clientId?: string;
    meetingId?: string;
    decisionRef?: string;
    status?: string;
  }) {
    if (query?.decisionRef) {
      return DecisionService.findAllVersions(query.decisionRef);
    }

    const decisions = await prisma.decision.findMany({
      where: {
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        status: query?.status as 'ACTIVE' | 'SUPERSEDED' | 'REVOKED' | undefined,
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
      orderBy: [{ decisionRef: 'asc' }, { version: 'desc' }],
    });

    // Filter to only latest versions (unless status filter is applied)
    if (!query?.status) {
      const latestVersions = new Map<string, (typeof decisions)[0]>();
      for (const decision of decisions) {
        if (!latestVersions.has(decision.decisionRef)) {
          latestVersions.set(decision.decisionRef, decision);
        }
      }
      return Array.from(latestVersions.values()).sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    }

    return decisions;
  },

  async revoke(decisionRef: string) {
    const latest = await prisma.decision.findFirst({
      where: { decisionRef, status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      throw new Error('Active decision not found');
    }

    return prisma.decision.update({
      where: { id: latest.id },
      data: { status: 'REVOKED' },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async deleteByRef(decisionRef: string) {
    return prisma.decision.deleteMany({
      where: { decisionRef },
    });
  },

  async deleteById(id: string) {
    return prisma.decision.delete({
      where: { id },
    });
  },
};
