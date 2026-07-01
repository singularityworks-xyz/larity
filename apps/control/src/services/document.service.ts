import { applyPagination } from "../lib/pagination";
import { prisma } from "../lib/prisma";
import type {
  CreateDocumentInput,
  DocumentQueryInput,
  UpdateDocumentInput,
} from "../validators";

export const DocumentService = {
  async create(orgId: string, data: CreateDocumentInput) {
    const client = await prisma.client.findFirst({
      where: { id: data.clientId, orgId },
    });
    if (!client) {
      throw new Error("Client not found or access denied");
    }

    return prisma.document.create({
      data,
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        parent: { select: { id: true, title: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.document.findFirst({
      where: { id, client: { orgId } },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        parent: { select: { id: true, title: true } },
        children: {
          select: { id: true, title: true, type: true, status: true },
        },
      },
    });
  },

  findAll(orgId: string, query?: DocumentQueryInput) {
    return prisma.document.findMany({
      where: {
        client: { orgId },
        clientId: query?.clientId,
        type: query?.type as
          | "NOTE"
          | "CONTRACT"
          | "PROPOSAL"
          | "SOW"
          | "BRIEF"
          | "TEMPLATE"
          | "OTHER"
          | undefined,
        status: query?.status as "DRAFT" | "ACTIVE" | "ARCHIVED" | undefined,
        parentId: query?.parentId,
        createdById: query?.createdById,
      },
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { children: true } },
      },
      orderBy: { updatedAt: "desc" },
      ...applyPagination(query),
    });
  },

  async update(id: string, orgId: string, data: UpdateDocumentInput) {
    const existing = await prisma.document.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Document not found");
    }
    // Use atomic increment for version to avoid race condition
    // Only increment version if content is being updated
    if (data.content) {
      return prisma.document.update({
        where: { id },
        data: {
          ...data,
          version: { increment: 1 },
        },
        include: {
          client: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true, email: true } },
          parent: { select: { id: true, title: true } },
        },
      });
    }

    return prisma.document.update({
      where: { id },
      data,
      include: {
        client: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        parent: { select: { id: true, title: true } },
      },
    });
  },

  async archive(id: string, orgId: string) {
    const existing = await prisma.document.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Document not found");
    }
    return prisma.document.update({
      where: { id },
      data: { status: "ARCHIVED" },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.document.findFirst({
      where: { id, client: { orgId } },
    });
    if (!existing) {
      throw new Error("Document not found");
    }
    return prisma.document.delete({
      where: { id },
    });
  },
};
