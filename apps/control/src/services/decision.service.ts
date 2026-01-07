import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';

interface CreateDecisionData {
  title: string;
  content: string;
  rationale?: string;
  evidence?: string;
  orgId: string;
  meetingId?: string;
  authorId?: string;
}

interface UpdateDecisionData {
  title?: string;
  content?: string;
  rationale?: string;
  evidence?: string;
}

interface DecisionQuery {
  orgId?: string;
  meetingId?: string;
  authorId?: string;
  decisionRef?: string;
}

export const DecisionService = {
  /**
   * Create a new decision (version 1)
   */
  async create(data: CreateDecisionData) {
    return prisma.decision.create({
      data: {
        decisionRef: randomUUID(),
        version: 1,
        title: data.title,
        content: data.content,
        rationale: data.rationale,
        evidence: data.evidence,
        orgId: data.orgId,
        meetingId: data.meetingId,
        authorId: data.authorId,
      },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * Create a new version of an existing decision
   * This creates a new record with incremented version number
   */
  async createRevision(decisionRef: string, data: UpdateDecisionData, authorId?: string) {
    // Get the latest version
    const latest = await prisma.decision.findFirst({
      where: { decisionRef },
      orderBy: { version: 'desc' },
    });

    if (!latest) {
      throw new Error('Decision not found');
    }

    // Create new version with merged data
    return prisma.decision.create({
      data: {
        decisionRef,
        version: latest.version + 1,
        title: data.title ?? latest.title,
        content: data.content ?? latest.content,
        rationale: data.rationale ?? latest.rationale,
        evidence: data.evidence ?? latest.evidence,
        orgId: latest.orgId,
        meetingId: latest.meetingId,
        authorId: authorId ?? latest.authorId,
      },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * Find decision by unique id
   */
  async findById(id: string) {
    return prisma.decision.findUnique({
      where: { id },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * Get the latest version of a decision by decisionRef
   */
  async findLatestByRef(decisionRef: string) {
    return prisma.decision.findFirst({
      where: { decisionRef },
      orderBy: { version: 'desc' },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * Get all versions of a decision (full history)
   */
  async findAllVersions(decisionRef: string) {
    return prisma.decision.findMany({
      where: { decisionRef },
      orderBy: { version: 'desc' },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * Get a specific version of a decision
   */
  async findByRefAndVersion(decisionRef: string, version: number) {
    return prisma.decision.findUnique({
      where: {
        decisionRef_version: { decisionRef, version },
      },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
    });
  },

  /**
   * List decisions (returns latest versions only by default)
   */
  async findAll(query: DecisionQuery = {}) {
    if (query.decisionRef) {
      // If decisionRef specified, return all versions for that ref
      return DecisionService.findAllVersions(query.decisionRef);
    }

    // Get latest versions for each decision
    const decisions = await prisma.decision.findMany({
      where: {
        ...(query.orgId && { orgId: query.orgId }),
        ...(query.meetingId && { meetingId: query.meetingId }),
        ...(query.authorId && { authorId: query.authorId }),
      },
      include: {
        org: true,
        meeting: true,
        author: true,
      },
      orderBy: [{ decisionRef: 'asc' }, { version: 'desc' }],
    });

    // Filter to only latest versions
    const latestVersions = new Map<string, (typeof decisions)[0]>();
    for (const decision of decisions) {
      if (!latestVersions.has(decision.decisionRef)) {
        latestVersions.set(decision.decisionRef, decision);
      }
    }

    return Array.from(latestVersions.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  },

  /**
   * Delete a decision (all versions)
   */
  async deleteByRef(decisionRef: string) {
    return prisma.decision.deleteMany({
      where: { decisionRef },
    });
  },

  /**
   * Delete a specific decision record by id
   */
  async deleteById(id: string) {
    return prisma.decision.delete({
      where: { id },
    });
  },
};
