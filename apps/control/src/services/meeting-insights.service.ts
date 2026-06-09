import { isMeetingAnalysis } from "@larity/infra/prisma/meeting-analysis.types";
import { prisma } from "../lib/prisma";

export const MeetingInsightsService = {
  async getInsights(meetingId: string) {
    const importantPointWhere: {
      meetingId: string;
    } = { meetingId };

    const [meeting, decisions, tasks, openQuestions, importantPoints] =
      await Promise.all([
        prisma.meeting.findUnique({
          where: { id: meetingId },
          select: {
            summary: true,
            startedAt: true,
            endedAt: true,
          },
        }),
        prisma.decision.findMany({
          where: { meetingId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.task.findMany({
          where: { meetingId },
          include: { assignee: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.openQuestion.findMany({
          where: { meetingId },
          include: { resolvedByDecision: true, assignee: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.importantPoint.findMany({
          where: importantPointWhere,
          include: { speaker: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const commitments = importantPoints.filter(
      (p) => p.category === "COMMITMENT"
    );
    const otherPoints = importantPoints.filter(
      (p) => p.category !== "COMMITMENT"
    );

    const rawSummary = meeting?.summary;
    const analysis = isMeetingAnalysis(rawSummary) ? rawSummary : null;

    return {
      analysis,
      decisions,
      commitments,
      tasks,
      openQuestions,
      importantPoints: {
        risks: otherPoints.filter((p) => p.category === "RISK"),
        constraints: otherPoints.filter((p) => p.category === "CONSTRAINT"),
        insights: otherPoints.filter((p) => p.category === "INSIGHT"),
        warnings: otherPoints.filter((p) => p.category === "WARNING"),
        opportunities: otherPoints.filter((p) => p.category === "OPPORTUNITY"),
      },
    };
  },
};
