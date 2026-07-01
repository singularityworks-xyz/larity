import { prisma } from "../lib/prisma";
import type {
  CreateMeetingParticipantInput,
  UpdateMeetingParticipantInput,
} from "../validators";

export const MeetingParticipantService = {
  async addInternal(
    meetingId: string,
    orgId: string,
    userId: string,
    role: "HOST" | "PARTICIPANT" | "OBSERVER" = "PARTICIPANT"
  ) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, client: { orgId } },
    });
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    return prisma.meetingParticipant.create({
      data: { meetingId, userId, role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async addExternal(
    meetingId: string,
    orgId: string,
    externalName: string,
    externalEmail: string,
    role: "HOST" | "PARTICIPANT" | "OBSERVER" = "PARTICIPANT"
  ) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, client: { orgId } },
    });
    if (!meeting) {
      throw new Error("Meeting not found");
    }

    return prisma.meetingParticipant.create({
      data: { meetingId, externalName, externalEmail, role },
    });
  },

  async create(orgId: string, data: CreateMeetingParticipantInput) {
    const meeting = await prisma.meeting.findFirst({
      where: { id: data.meetingId, client: { orgId } },
    });
    if (!meeting) {
      throw new Error("Meeting not found");
    }
    return prisma.meetingParticipant.create({
      data,
      include: {
        user: data.userId
          ? { select: { id: true, name: true, email: true } }
          : false,
      },
    });
  },

  findById(id: string, orgId: string) {
    return prisma.meetingParticipant.findFirst({
      where: { id, meeting: { client: { orgId } } },
      include: {
        meeting: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findByMeeting(meetingId: string, orgId: string) {
    return prisma.meetingParticipant.findMany({
      where: { meetingId, meeting: { client: { orgId } } },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { role: "asc" },
    });
  },

  async update(id: string, orgId: string, data: UpdateMeetingParticipantInput) {
    const existing = await prisma.meetingParticipant.findFirst({
      where: { id, meeting: { client: { orgId } } },
    });
    if (!existing) {
      throw new Error("Participant not found");
    }
    return prisma.meetingParticipant.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  async markAttended(id: string, orgId: string) {
    const existing = await prisma.meetingParticipant.findFirst({
      where: { id, meeting: { client: { orgId } } },
    });
    if (!existing) {
      throw new Error("Participant not found");
    }
    return prisma.meetingParticipant.update({
      where: { id },
      data: { attendedAt: new Date() },
    });
  },

  async remove(id: string, orgId: string) {
    const existing = await prisma.meetingParticipant.findFirst({
      where: { id, meeting: { client: { orgId } } },
    });
    if (!existing) {
      throw new Error("Participant not found");
    }
    return prisma.meetingParticipant.delete({
      where: { id },
    });
  },
};
