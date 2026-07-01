import { prisma } from "../lib/prisma";
import type {
  CreateClientMemberInput,
  UpdateClientMemberInput,
} from "../validators";

// ClientMembers are external contacts (not linked to User)
export const ClientMemberService = {
  async create(orgId: string, data: CreateClientMemberInput) {
    const { clientId, ...rest } = data;

    // Verify client exists and belongs to org
    const client = await prisma.client.findFirst({
      where: { id: clientId, orgId },
    });

    if (!client) {
      throw new Error("Client not found or access denied");
    }

    return prisma.clientMember.create({
      data: {
        ...rest,
        client: { connect: { id: clientId } },
        // biome-ignore lint/suspicious/noExplicitAny: prisma nested create type mismatch
      } as any,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.clientMember.findFirst({
      where: { id, client: { orgId } },
    });

    if (!existing) {
      throw new Error("Client contact not found");
    }

    return prisma.clientMember.delete({
      where: { id },
    });
  },

  async update(id: string, orgId: string, data: UpdateClientMemberInput) {
    const existing = await prisma.clientMember.findFirst({
      where: { id, client: { orgId } },
    });

    if (!existing) {
      throw new Error("Client contact not found");
    }

    return prisma.clientMember.update({
      where: { id },
      // biome-ignore lint/suspicious/noExplicitAny: prisma input type mismatch
      data: data as any,
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.clientMember.findFirst({
      where: { id, client: { orgId } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  findByClientAndEmail(clientId: string, email: string, orgId: string) {
    return prisma.clientMember.findFirst({
      where: { clientId, email, client: { orgId } },
      include: {
        client: { select: { id: true, name: true, slug: true } },
      },
    });
  },

  findByClient(clientId: string, orgId: string) {
    return prisma.clientMember.findMany({
      where: { clientId, client: { orgId } },
      orderBy: [
        { role: "asc" }, // PRIMARY_CONTACT first
        { updatedAt: "desc" },
      ],
    });
  },

  findByEmail(email: string, orgId: string) {
    return prisma.clientMember.findMany({
      where: { email, client: { orgId } },
      include: {
        client: { select: { id: true, name: true, slug: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  },
};
