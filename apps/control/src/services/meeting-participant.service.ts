import { prisma } from "../lib/prisma";
import type {
  CreateMeetingParticipantInput,
  UpdateMeetingParticipantInput,
} from "../validators";

export const MeetingParticipantService = {
  addInternal(
    meetingId: string,
    userId: string,
    role: "HOST" | "PARTICIPANT" | "OBSERVER" = "PARTICIPANT"
  ) {
    return prisma.meetingParticipant.create({
      data: { meetingId, userId, role },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  addExternal(
    meetingId: string,
    externalName: string,
    externalEmail: string,
    role: "HOST" | "PARTICIPANT" | "OBSERVER" = "PARTICIPANT"
  ) {
    return prisma.meetingParticipant.create({
      data: { meetingId, externalName, externalEmail, role },
    });
  },

  create(data: CreateMeetingParticipantInput) {
    return prisma.meetingParticipant.create({
      data,
      include: {
        user: data.userId
          ? { select: { id: true, name: true, email: true } }
          : false,
      },
    });
  },

  findById(id: string) {
    return prisma.meetingParticipant.findUnique({
      where: { id },
      include: {
        meeting: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  findByMeeting(meetingId: string) {
    return prisma.meetingParticipant.findMany({
      where: { meetingId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { role: "asc" },
    });
  },

  update(id: string, data: UpdateMeetingParticipantInput) {
    return prisma.meetingParticipant.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  },

  markAttended(id: string) {
    return prisma.meetingParticipant.update({
      where: { id },
      data: { attendedAt: new Date() },
    });
  },

  remove(id: string) {
    return prisma.meetingParticipant.delete({
      where: { id },
    });
  },
};
