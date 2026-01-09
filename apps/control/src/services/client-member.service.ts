import { prisma } from '../lib/prisma';
import type { CreateClientMemberInput, UpdateClientMemberInput } from '../validators';

// ClientMembers are external contacts (not linked to User)
export const ClientMemberService = {
  async create(data: CreateClientMemberInput) {
    const { clientId, ...rest } = data;
    return prisma.clientMember.create({
      data: {
        ...rest,
        client: { connect: { id: clientId } },
      },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async delete(id: string) {
    return prisma.clientMember.delete({
      where: { id },
    });
  },

  async update(id: string, data: UpdateClientMemberInput) {
    return prisma.clientMember.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.clientMember.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findByClientAndEmail(clientId: string, email: string) {
    return prisma.clientMember.findFirst({
      where: { clientId, email },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async findByClient(clientId: string) {
    return prisma.clientMember.findMany({
      where: { clientId },
      orderBy: [
        { role: 'asc' }, // PRIMARY_CONTACT first
        { updatedAt: 'desc' },
      ],
    });
  },

  async findByEmail(email: string) {
    return prisma.clientMember.findMany({
      where: { email },
      include: {
        client: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },
};
