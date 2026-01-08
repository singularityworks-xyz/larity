import { prisma } from '../lib/prisma';
import type { CreateReminderInput, UpdateReminderInput } from '../validators';

export const ReminderService = {
  async create(data: CreateReminderInput) {
    return prisma.reminder.create({
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  async findById(id: string) {
    return prisma.reminder.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  async findAll(query?: {
    userId?: string;
    clientId?: string;
    status?: string;
    linkedEntityType?: string;
    dueBefore?: Date;
    dueAfter?: Date;
  }) {
    return prisma.reminder.findMany({
      where: {
        userId: query?.userId,
        clientId: query?.clientId,
        status: query?.status as 'PENDING' | 'TRIGGERED' | 'DISMISSED' | 'SNOOZED' | undefined,
        linkedEntityType: query?.linkedEntityType as
          | 'TASK'
          | 'MEETING'
          | 'DECISION'
          | 'OPEN_QUESTION'
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
      orderBy: { dueAt: 'asc' },
    });
  },

  async findDue(beforeDate: Date) {
    return prisma.reminder.findMany({
      where: {
        status: 'PENDING',
        dueAt: { lte: beforeDate },
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
      orderBy: { dueAt: 'asc' },
    });
  },

  async update(id: string, data: UpdateReminderInput) {
    return prisma.reminder.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        client: { select: { id: true, name: true } },
      },
    });
  },

  async trigger(id: string) {
    return prisma.reminder.update({
      where: { id },
      data: { status: 'TRIGGERED' },
    });
  },

  async dismiss(id: string) {
    return prisma.reminder.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });
  },

  async snooze(id: string, newDueAt: Date) {
    return prisma.reminder.update({
      where: { id },
      data: { status: 'SNOOZED', dueAt: newDueAt },
    });
  },

  async delete(id: string) {
    return prisma.reminder.delete({
      where: { id },
    });
  },
};
