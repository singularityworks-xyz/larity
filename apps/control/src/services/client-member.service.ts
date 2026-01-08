import { prisma } from '../lib/prisma';
import type { CreateClientMemberInput, UpdateClientMemberInput } from '../validators';

export const ClientMemberService = {
  async assign(data: CreateClientMemberInput) {
    return prisma.clientMember.create({
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async unassign(clientId: string, userId: string) {
    return prisma.clientMember.delete({
      where: { clientId_userId: { clientId, userId } },
    });
  },

  async deleteById(id: string) {
    return prisma.clientMember.delete({
      where: { id },
    });
  },

  async updateRole(id: string, data: UpdateClientMemberInput) {
    return prisma.clientMember.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.clientMember.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findByClientAndUser(clientId: string, userId: string) {
    return prisma.clientMember.findUnique({
      where: { clientId_userId: { clientId, userId } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findByClient(clientId: string) {
    return prisma.clientMember.findMany({
      where: { clientId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  },

  async findByUser(userId: string) {
    return prisma.clientMember.findMany({
      where: { userId },
      include: {
        client: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  },
};
