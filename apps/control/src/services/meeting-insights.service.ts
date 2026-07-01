import { isMeetingAnalysis } from "@larity/db/meeting-analysis.types";
import { prisma } from "../lib/prisma";

export const MeetingInsightsService = {
  async getInsights(meetingId: string, orgId: string) {
    const importantPointWhere: {
      meetingId: string;
      client: { orgId: string };
    } = { meetingId, client: { orgId } };

    const [meeting, decisions, tasks, openQuestions, importantPoints] =
      await Promise.all([
        prisma.meeting.findFirst({
          where: { id: meetingId, client: { orgId } },
          select: {
            summary: true,
            startedAt: true,
            endedAt: true,
          },
        }),
        prisma.decision.findMany({
          where: { meetingId, client: { orgId } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.task.findMany({
          where: { meetingId, client: { orgId } },
          include: { assignee: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.openQuestion.findMany({
          where: { meetingId, client: { orgId } },
          include: { resolvedByDecision: true, assignee: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.importantPoint.findMany({
          where: importantPointWhere,
          include: { speaker: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const rawSummary = meeting?.summary;
    const analysis = isMeetingAnalysis(rawSummary) ? rawSummary : null;

    return {
      analysis,
      decisions,
      tasks,
      openQuestions,
      importantPoints,
    };
  },
};
