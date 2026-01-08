import { applyPagination } from '../lib/pagination';
import { prisma } from '../lib/prisma';
import type { ClientQueryInput, CreateClientInput, UpdateClientInput } from '../validators';

export const ClientService = {
  async create(data: CreateClientInput) {
    return prisma.client.create({
      data,
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.client.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            members: true,
            meetings: true,
            tasks: true,
            decisions: true,
            openQuestions: true,
            documents: true,
          },
        },
      },
    });
  },

  async findByOrgAndSlug(orgId: string, slug: string) {
    return prisma.client.findUnique({
      where: { orgId_slug: { orgId, slug } },
      include: {
        org: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            members: true,
            meetings: true,
            tasks: true,
            decisions: true,
          },
        },
      },
    });
  },

  async findAll(query?: ClientQueryInput) {
    return prisma.client.findMany({
      where: {
        orgId: query?.orgId,
        status: query?.status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | undefined,
      },
      include: {
        org: { select: { id: true, name: true, slug: true } },
        _count: {
          select: {
            members: true,
            meetings: true,
            tasks: true,
            decisions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      ...applyPagination(query),
    });
  },

  async update(id: string, data: UpdateClientInput) {
    return prisma.client.update({
      where: { id },
      data,
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async delete(id: string) {
    return prisma.client.delete({
      where: { id },
    });
  },
};
