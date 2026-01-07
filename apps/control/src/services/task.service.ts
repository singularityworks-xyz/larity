import type { TaskStatus } from '../../../../packages/infra/prisma/generated/prisma/client';
import { prisma } from '../lib/prisma';

interface CreateTaskData {
  title: string;
  description?: string;
  orgId: string;
  meetingId?: string;
  assigneeId?: string;
  creatorId?: string;
  dueAt?: string;
  status?: TaskStatus;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  status?: TaskStatus;
  dueAt?: string;
  assigneeId?: string;
}

interface TaskQuery {
  orgId?: string;
  status?: TaskStatus;
  assigneeId?: string;
  meetingId?: string;
}

export const TaskService = {
  async create(data: CreateTaskData) {
    return prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        orgId: data.orgId,
        meetingId: data.meetingId,
        assigneeId: data.assigneeId,
        creatorId: data.creatorId,
        status: data.status,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      },
      include: {
        org: true,
        meeting: true,
        assignee: true,
        creator: true,
      },
    });
  },

  async findById(id: string) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        org: true,
        meeting: true,
        assignee: true,
        creator: true,
      },
    });
  },

  async findAll(query: TaskQuery = {}) {
    return prisma.task.findMany({
      where: {
        ...(query.orgId && { orgId: query.orgId }),
        ...(query.status && { status: query.status }),
        ...(query.assigneeId && { assigneeId: query.assigneeId }),
        ...(query.meetingId && { meetingId: query.meetingId }),
      },
      include: {
        org: true,
        meeting: true,
        assignee: true,
        creator: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateTaskData) {
    return prisma.task.update({
      where: { id },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      },
      include: {
        org: true,
        meeting: true,
        assignee: true,
        creator: true,
      },
    });
  },

  async delete(id: string) {
    return prisma.task.delete({
      where: { id },
    });
  },

  async markComplete(id: string) {
    return prisma.task.update({
      where: { id },
      data: { status: 'DONE' },
    });
  },

  async markOpen(id: string) {
    return prisma.task.update({
      where: { id },
      data: { status: 'OPEN' },
    });
  },
};
