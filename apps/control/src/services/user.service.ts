import { prisma } from '../lib/prisma';
import type { CreateUserInput, UpdateUserInput } from '../validators';

export const UserService = {
  async create(data: CreateUserInput) {
    return prisma.user.create({
      data: {
        ...data,
        emailVerified: false,
      },
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        org: { select: { id: true, name: true, slug: true } },
        clientMemberships: {
          include: {
            client: { select: { id: true, name: true, slug: true, status: true } },
          },
        },
        _count: {
          select: {
            assignedTasks: true,
            createdTasks: true,
            authoredDecisions: true,
            clientMemberships: true,
          },
        },
      },
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findAll(query?: { orgId?: string; role?: string }) {
    return prisma.user.findMany({
      where: {
        orgId: query?.orgId,
        role: query?.role as 'OWNER' | 'ADMIN' | 'MEMBER' | undefined,
      },
      include: {
        org: { select: { id: true, name: true, slug: true } },
        _count: {
          select: { assignedTasks: true, clientMemberships: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateUserInput) {
    return prisma.user.update({
      where: { id },
      data,
      include: {
        org: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  },

  async getClientAssignments(id: string) {
    return prisma.clientMember.findMany({
      where: { userId: id },
      include: {
        client: {
          select: { id: true, name: true, slug: true, status: true, industry: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });
  },
};
