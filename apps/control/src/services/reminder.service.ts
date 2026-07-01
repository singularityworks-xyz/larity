import { prisma } from "../lib/prisma";
import type { CreateReminderInput, UpdateReminderInput } from "../validators";

export const ReminderService = {
  async create(orgId: string, data: CreateReminderInput) {
    // Validate client belongs to org if provided
    if (data.clientId) {
      const client = await prisma.client.findFirst({
        where: { id: data.clientId, orgId },
      });
      if (!client) {
        throw new Error("Client not found or access denied");
      }
    }
    return prisma.reminder.create({
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.reminder.findFirst({
      where: { id, user: { orgId } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  findAll(
    orgId: string,
    query?: {
      userId?: string;
      clientId?: string;
      status?: string;
      linkedEntityType?: string;
      dueBefore?: Date;
      dueAfter?: Date;
    }
  ) {
    return prisma.reminder.findMany({
      where: {
        user: { orgId },
        userId: query?.userId,
        clientId: query?.clientId,
        status: query?.status as
          | "PENDING"
          | "TRIGGERED"
          | "DISMISSED"
          | "SNOOZED"
          | undefined,
        linkedEntityType: query?.linkedEntityType as
          | "TASK"
          | "MEETING"
          | "DECISION"
          | "OPEN_QUESTION"
          | undefined,
        dueAt: {
          ...(query?.dueBefore && { lte: query.dueBefore }),
          ...(query?.dueAfter && { gte: query.dueAfter }),
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
    });
  },

  findDue(orgId: string, beforeDate: Date) {
    return prisma.reminder.findMany({
      where: {
        user: { orgId },
        status: "PENDING",
        dueAt: { lte: beforeDate },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: "asc" },
    });
  },

  async update(id: string, orgId: string, data: UpdateReminderInput) {
    const existing = await prisma.reminder.findFirst({
      where: { id, user: { orgId } },
    });
    if (!existing) {
      throw new Error("Reminder not found");
    }
    return prisma.reminder.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  async trigger(id: string, orgId: string) {
    const existing = await prisma.reminder.findFirst({
      where: { id, user: { orgId } },
    });
    if (!existing) {
      throw new Error("Reminder not found");
    }
    return prisma.reminder.update({
      where: { id },
      data: { status: "TRIGGERED" },
    });
  },

  async dismiss(id: string, orgId: string) {
    const existing = await prisma.reminder.findFirst({
      where: { id, user: { orgId } },
    });
    if (!existing) {
      throw new Error("Reminder not found");
    }
    return prisma.reminder.update({
      where: { id },
      data: { status: "DISMISSED" },
    });
  },

  async snooze(id: string, orgId: string, newDueAt: Date) {
    const existing = await prisma.reminder.findFirst({
      where: { id, user: { orgId } },
    });
    if (!existing) {
      throw new Error("Reminder not found");
    }
    return prisma.reminder.update({
      where: { id },
      data: { status: "SNOOZED", dueAt: newDueAt },
    });
  },

  async delete(id: string, orgId: string) {
    const existing = await prisma.reminder.findFirst({
      where: { id, user: { orgId } },
    });
    if (!existing) {
      throw new Error("Reminder not found");
    }
    return prisma.reminder.delete({
      where: { id },
    });
  },
};
