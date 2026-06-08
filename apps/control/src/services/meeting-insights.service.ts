import type { ImportantPointCategory } from "@prisma/client";
import { prisma } from "../lib/prisma";

export interface GetInsightsOptions {
  category?: ImportantPointCategory;
}

export const MeetingInsightsService = {
  async getInsights(meetingId: string, options: GetInsightsOptions = {}) {
    const importantPointWhere: {
      meetingId: string;
      category?: ImportantPointCategory;
    } = { meetingId };
    if (options.category) {
      importantPointWhere.category = options.category;
    }

    const [decisions, tasks, openQuestions, importantPoints] =
      await Promise.all([
        prisma.decision.findMany({
          where: { meetingId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.task.findMany({
          where: { meetingId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.openQuestion.findMany({
          where: { meetingId },
          orderBy: { createdAt: "desc" },
        }),
        prisma.importantPoint.findMany({
          where: importantPointWhere,
          orderBy: { createdAt: "desc" },
        }),
      ]);

    return {
      decisions,
      tasks,
      openQuestions,
      importantPoints,
    };
  },
};
