import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import type { CreateDecisionInput, ReviseDecisionInput } from "../validators";

export const DecisionService = {
  async create(orgId: string, data: CreateDecisionInput) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, orgId },
    });
    if (!client) {
      throw new Error("Client not found or access denied");
    }

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

  async createRevision(
    orgId: string,
    decisionRef: string,
    data: ReviseDecisionInput
  ) {
    const latest = await prisma.decision.findFirst({
      where: { decisionRef, client: { orgId } },
      orderBy: { version: "desc" },
    });

    if (!latest) {
      throw new Error("Decision not found");
    }

    // Mark previous version as superseded
    await prisma.decision.update({
      where: { id: latest.id },
      data: { status: "SUPERSEDED" },
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
        status: "ACTIVE",
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.decision.findFirst({
      where: { id, client: { orgId } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        tasks: { select: { id: true, title: true, status: true } },
        resolvedQuestions: { select: { id: true, question: true } },
      },
    });
  },

  findLatestByRef(decisionRef: string, orgId: string) {
    return prisma.decision.findFirst({
      where: { decisionRef, client: { orgId } },
      orderBy: { version: "desc" },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
        tasks: { select: { id: true, title: true, status: true } },
      },
    });
  },

  findAllVersions(decisionRef: string, orgId: string) {
    return prisma.decision.findMany({
      where: { decisionRef, client: { orgId } },
      orderBy: { version: "desc" },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  findByRefAndVersion(decisionRef: string, version: number, orgId: string) {
    return prisma.decision.findFirst({
      where: { decisionRef, version, client: { orgId } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
    });
  },

  async findAll(
    orgId: string,
    query?: {
      clientId?: string;
      meetingId?: string;
      decisionRef?: string;
      status?: string;
    }
  ) {
    if (query?.decisionRef) {
      return DecisionService.findAllVersions(query.decisionRef, orgId);
    }

    const decisions = await prisma.decision.findMany({
      where: {
        client: { orgId },
        clientId: query?.clientId,
        meetingId: query?.meetingId,
        status: query?.status as
          | "ACTIVE"
          | "SUPERSEDED"
          | "REVOKED"
          | undefined,
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        meeting: { select: { id: true, title: true } },
      },
      orderBy: [{ decisionRef: "asc" }, { version: "desc" }],
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

  async revoke(decisionRef: string, orgId: string) {
    const latest = await prisma.decision.findFirst({
      where: { decisionRef, status: "ACTIVE", client: { orgId } },
      orderBy: { version: "desc" },
    });

    if (!latest) {
      throw new Error("Active decision not found");
    }

    return prisma.decision.update({
      where: { id: latest.id },
      data: { status: "REVOKED" },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async deleteByRef(decisionRef: string, orgId: string) {
    const existing = await prisma.decision.findFirst({
      where: { decisionRef, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Decision not found");
    }
    return prisma.decision.deleteMany({
      where: { decisionRef },
    });
  },

  async deleteById(id: string, orgId: string) {
    const existing = await prisma.decision.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Decision not found");
    }
    return prisma.decision.delete({
      where: { id },
    });
  },
};
