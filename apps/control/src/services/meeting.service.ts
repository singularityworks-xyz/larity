import type { MeetingStatus } from '../../../../packages/infra/prisma/generated/prisma/client';
import { prisma } from '../lib/prisma';

interface CreateMeetingData {
  title: string;
  description?: string;
  orgId: string;
  scheduledAt?: string;
  status?: MeetingStatus;
}

interface UpdateMeetingData {
  title?: string;
  description?: string;
  status?: MeetingStatus;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
}

interface MeetingQuery {
  orgId?: string;
  status?: MeetingStatus;
}

export const MeetingService = {
  async create(data: CreateMeetingData) {
    return prisma.meeting.create({
      data: {
        title: data.title,
        description: data.description,
        orgId: data.orgId,
        status: data.status,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
      },
      include: { org: true },
    });
  },

  async findById(id: string) {
    return prisma.meeting.findUnique({
      where: { id },
      include: {
        org: true,
        tasks: {
          include: { assignee: true },
        },
        decisions: {
          include: { author: true },
          orderBy: { version: 'desc' },
        },
      },
    });
  },

  async findAll(query: MeetingQuery = {}) {
    return prisma.meeting.findMany({
      where: {
        ...(query.orgId && { orgId: query.orgId }),
        ...(query.status && { status: query.status }),
      },
      include: {
        org: true,
        _count: {
          select: { tasks: true, decisions: true },
        },
      },
      orderBy: { scheduledAt: 'desc' },
    });
  },

  async update(id: string, data: UpdateMeetingData) {
    return prisma.meeting.update({
      where: { id },
      data: {
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
      },
      include: { org: true },
    });
  },

  async delete(id: string) {
    return prisma.meeting.delete({
      where: { id },
    });
  },

  async startMeeting(id: string) {
    return prisma.meeting.update({
      where: { id },
      data: {
        status: 'LIVE',
        startedAt: new Date(),
      },
    });
  },

  async endMeeting(id: string) {
    return prisma.meeting.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });
  },
};
