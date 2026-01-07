import { prisma } from '../lib/prisma';

export const OrgService = {
  async create(data: { name: string }) {
    return prisma.org.create({ data });
  },

  async findById(id: string) {
    return prisma.org.findUnique({
      where: { id },
      include: {
        _count: {
          select: { users: true, meetings: true, tasks: true, decisions: true },
        },
      },
    });
  },

  async findAll() {
    return prisma.org.findMany({
      include: {
        _count: {
          select: { users: true, meetings: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: { name?: string }) {
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
