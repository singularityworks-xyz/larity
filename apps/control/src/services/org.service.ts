import { prisma } from "../lib/prisma";
import type { CreateOrgInput, UpdateOrgInput } from "../validators";

export const OrgService = {
  create(data: CreateOrgInput, creatorUserId: string) {
    return prisma.$transaction(async (tx) => {
      // Create the org
      const org = await tx.org.create({
        data,
        include: {
          _count: {
            select: { users: true, clients: true },
          },
        },
      });

      // Set the creator as member and owner of the org
      await tx.user.update({
        where: { id: creatorUserId },
        data: {
          orgId: org.id,
          role: "OWNER",
        },
      });

      return org;
    });
  },

  findById(id: string) {
    return prisma.org.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, clients: true, policyGuardrails: true },
        },
      },
    });
  },

  findBySlug(slug: string) {
    return prisma.org.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { users: true, clients: true },
        },
      },
    });
  },

  findAll(query?: { slug?: string }) {
    return prisma.org.findMany({
      where: {
        slug: query?.slug,
      },
      include: {
        _count: {
          select: { users: true, clients: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  },

  update(id: string, data: UpdateOrgInput) {
    return prisma.org.update({
      where: { id },
      data,
    });
  },

  delete(id: string) {
    return prisma.org.delete({
      where: { id },
    });
  },

  async isOwner(orgId: string, userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true, role: true },
    });
    return user?.orgId === orgId && user?.role === "OWNER";
  },
};
