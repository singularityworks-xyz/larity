import { prisma } from "../lib/prisma";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function toBriefStatus(
  summary: string | null | undefined
): "prepped" | "not_prepped" {
  return summary ? "prepped" : "not_prepped";
}

function computeDurationMs(
  startedAt: Date | null,
  endedAt: Date | null
): number | null {
  if (!(startedAt && endedAt)) {
    return null;
  }
  return endedAt.getTime() - startedAt.getTime();
}

function minutesUntil(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60_000));
}

export interface HomeData {
  nextMeeting: {
    id: string;
    title: string;
    client: { id: string; name: string; slug: string };
    scheduledAt: string | null;
    briefStatus: "prepped" | "not_prepped";
    attendeeCount: number;
    startsInMinutes: number;
  } | null;
  todayMeetings: Array<{
    id: string;
    title: string;
    client: { id: string; name: string };
    scheduledAt: string | null;
    status: string;
    attendeeCount: number;
    briefStatus: "prepped" | "not_prepped";
  }>;
  recentActivity: Array<{
    id: string;
    title: string;
    client: { id: string; name: string };
    endedAt: string | null;
    durationMs: number | null;
    decisionsExtracted: number;
    tasksCreated: number;
    commitmentsCaptured: number;
  }>;
  openCommitments: Array<{
    id: string;
    content: string;
    client: { id: string; name: string };
    meetingId: string | null;
    meetingTitle: string | null;
    createdAt: string;
  }>;
}

export const HomeService = {
  async getHome(userId: string, _orgId: string): Promise<HomeData> {
    const now = new Date();
    const todayStart = startOfToday();
    const todayEnd = endOfToday();

    const nextMeeting = await prisma.meeting.findFirst({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: now },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        summary: true,
        client: { select: { id: true, name: true, slug: true } },
        _count: { select: { participants: true } },
      },
    });

    const todayMeetings = await prisma.meeting.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE"] },
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        title: true,
        scheduledAt: true,
        status: true,
        summary: true,
        client: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });

    const recentActivity = await prisma.meeting.findMany({
      where: { status: "ENDED" },
      orderBy: { endedAt: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        startedAt: true,
        endedAt: true,
        client: { select: { id: true, name: true } },
        _count: {
          select: {
            participants: true,
            tasks: true,
            decisions: true,
            importantPoints: true,
          },
        },
      },
    });

    const openCommitments = await prisma.importantPoint.findMany({
      where: {
        category: "COMMITMENT",
        speakerId: userId,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        content: true,
        createdAt: true,
        client: { select: { id: true, name: true } },
        meeting: { select: { id: true, title: true } },
      },
    });

    // Enrich recent activity with commitments-count per meeting
    const activityWithCommitments = await Promise.all(
      recentActivity.map(async (m) => {
        let commitmentsCaptured = 0;
        try {
          commitmentsCaptured = await prisma.importantPoint.count({
            where: { meetingId: m.id, category: "COMMITMENT" },
          });
        } catch {
          commitmentsCaptured = 0;
        }

        return {
          id: m.id,
          title: m.title,
          client: m.client,
          endedAt: m.endedAt?.toISOString() ?? null,
          durationMs: computeDurationMs(m.startedAt, m.endedAt),
          decisionsExtracted: m._count.decisions ?? 0,
          tasksCreated: m._count.tasks ?? 0,
          commitmentsCaptured,
        };
      })
    );

    return {
      nextMeeting: nextMeeting
        ? {
            id: nextMeeting.id,
            title: nextMeeting.title,
            client: nextMeeting.client,
            scheduledAt: nextMeeting.scheduledAt?.toISOString() ?? null,
            briefStatus: toBriefStatus(nextMeeting.summary),
            attendeeCount: nextMeeting._count.participants ?? 0,
            startsInMinutes: minutesUntil(nextMeeting.scheduledAt ?? now),
          }
        : null,

      todayMeetings: todayMeetings.map((m) => ({
        id: m.id,
        title: m.title,
        client: m.client,
        scheduledAt: m.scheduledAt?.toISOString() ?? null,
        status: m.status,
        attendeeCount: m._count.participants ?? 0,
        briefStatus: toBriefStatus(m.summary),
      })),

      recentActivity: activityWithCommitments,

      openCommitments: openCommitments.map((c) => ({
        id: c.id,
        content: c.content,
        client: c.client,
        meetingId: c.meeting?.id ?? null,
        meetingTitle: c.meeting?.title ?? null,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  },
};
