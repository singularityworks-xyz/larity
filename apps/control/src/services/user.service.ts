import type { UserRole } from '../../../../packages/infra/prisma/generated/prisma/client';
import { prisma } from '../lib/prisma';

type CreateUserData = {
  name: string;
  email: string;
  orgId: string;
  role?: UserRole;
  image?: string;
};

type UpdateUserData = {
  name?: string;
  email?: string;
  role?: UserRole;
  image?: string;
};

type UserQuery = {
  orgId?: string;
  role?: UserRole;
};

export const UserService = {
  async create(data: CreateUserData) {
    return prisma.user.create({
      data: {
        ...data,
        emailVerified: false,
      },
      include: { org: true },
    });
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        org: true,
        _count: {
          select: { assignedTasks: true, createdTasks: true, decisions: true },
        },
      },
    });
  },

  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { org: true },
    });
  },

  async findAll(query: UserQuery = {}) {
    return prisma.user.findMany({
      where: {
        ...(query.orgId && { orgId: query.orgId }),
        ...(query.role && { role: query.role }),
      },
      include: {
        org: true,
        _count: {
          select: { assignedTasks: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateUserData) {
    return prisma.user.update({
      where: { id },
      data,
      include: { org: true },
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  },
};
