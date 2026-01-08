import { prisma } from '../lib/prisma';
import type { CreateMeetingParticipantInput, UpdateMeetingParticipantInput } from '../validators';

export const MeetingParticipantService = {
  async addInternal(
    meetingId: string,
    userId: string,
    role: 'HOST' | 'PARTICIPANT' | 'OBSERVER' = 'PARTICIPANT'
  ) {
    return prisma.meetingParticipant.create({
      data: { meetingId, userId, role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async addExternal(
    meetingId: string,
    externalName: string,
    externalEmail: string,
    role: 'HOST' | 'PARTICIPANT' | 'OBSERVER' = 'PARTICIPANT'
  ) {
    return prisma.meetingParticipant.create({
      data: { meetingId, externalName, externalEmail, role },
    });
  },

  async create(data: CreateMeetingParticipantInput) {
    return prisma.meetingParticipant.create({
      data,
      include: {
        user: data.userId ? { select: { id: true, name: true, email: true } } : false,
      },
    });
  },

  async findById(id: string) {
    return prisma.meetingParticipant.findUnique({
      where: { id },
      include: {
        meeting: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async findByMeeting(meetingId: string) {
    return prisma.meetingParticipant.findMany({
      where: { meetingId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { role: 'asc' },
    });
  },

  async update(id: string, data: UpdateMeetingParticipantInput) {
    return prisma.meetingParticipant.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async markAttended(id: string) {
    return prisma.meetingParticipant.update({
      where: { id },
      data: { attendedAt: new Date() },
    });
  },

  async remove(id: string) {
    return prisma.meetingParticipant.delete({
      where: { id },
    });
  },
};
