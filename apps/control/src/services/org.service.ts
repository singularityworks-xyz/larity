import { prisma } from '../lib/prisma';
import type { CreateOrgInput, UpdateOrgInput } from '../validators';

export const OrgService = {
  async create(data: CreateOrgInput) {
    return prisma.org.create({
      data,
      include: {
        _count: {
          select: { users: true, clients: true },
        },
      },
    });
  },

  async findById(id: string) {
    return prisma.org.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, clients: true, policyGuardrails: true },
        },
      },
    });
  },

  async findBySlug(slug: string) {
    return prisma.org.findUnique({
      where: { slug },
      include: {
        _count: {
          select: { users: true, clients: true },
        },
      },
    });
  },

  async findAll(query?: { slug?: string }) {
    return prisma.org.findMany({
      where: {
        slug: query?.slug,
      },
      include: {
        _count: {
          select: { users: true, clients: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateOrgInput) {
    return prisma.org.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.org.delete({
      where: { id },
    });
  },
};
