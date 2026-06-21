import { randomUUID } from "node:crypto";
import { GoogleGenAI, Type } from "@google/genai";
import { ImportantPointCategory } from "@larity/infra/prisma";
import { prisma } from "@larity/infra/prisma/client";
import { getRedisClient } from "@larity/infra/redis";
import { z } from "zod";

export const BriefSchema = z.object({
  tldr: z.string(),
  sentiment: z.string(),
  landmines: z.array(
    z.object({ id: z.string(), text: z.string(), category: z.string() })
  ),
  suggestedAgenda: z.array(z.string()),
  commitments: z.object({
    mine: z.array(
      z.object({ id: z.string(), text: z.string(), status: z.string() })
    ),
    theirs: z.array(
      z.object({ id: z.string(), text: z.string(), status: z.string() })
    ),
  }),
});

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  }
  return ai;
}

export const AIBriefGeneratorService = {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: pre-existing, refactor deferred
  async generateBriefData(meetingId: string, requestUserId?: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        client: true,
        participants: {
          include: { user: true },
        },
      },
    });

    if (!meeting) {
      throw new Error("Meeting not found");
    }

    const clientId = meeting.clientId;
    const hostParticipant = meeting.participants.find((p) => p.role === "HOST");
    const targetUserId = requestUserId || hostParticipant?.userId;

    // Fetch context for the LLM
    const [pastMeetings, openTasks, openQuestions, landmines] =
      await Promise.all([
        prisma.meeting
          .findMany({
            where: { clientId, status: "ENDED" },
            orderBy: { endedAt: "desc" },
            take: 10,
            select: {
              title: true,
              startedAt: true,
              summary: true,
              transcript: {
                select: {
                  content: true,
                  wordCount: true,
                },
              },
            },
          })
          .then((meetings) =>
            meetings
              .filter((m) => {
                if (m.summary == null || m.transcript == null) {
                  return false;
                }
                if (m.transcript.wordCount !== null) {
                  return m.transcript.wordCount > 0;
                }
                try {
                  const utterances = JSON.parse(m.transcript.content);
                  return Array.isArray(utterances) && utterances.length > 0;
                } catch {
                  return false;
                }
              })
              .slice(0, 3)
          ),
        prisma.task.findMany({
          where: { clientId, status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
        prisma.openQuestion.findMany({
          where: { clientId, status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        prisma.importantPoint.findMany({
          where: {
            clientId,
            category: {
              in: [
                ImportantPointCategory.WARNING,
                ImportantPointCategory.CONSTRAINT,
                ImportantPointCategory.RISK,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      ]);

    if (
      openTasks.length === 0 &&
      pastMeetings.length === 0 &&
      openQuestions.length === 0 &&
      landmines.length === 0
    ) {
      return {
        tldr: "This is the first meeting with this client. Let's make a great impression and establish mutual goals.",
        sentiment: "Neutral",
        landmines: [],
        suggestedAgenda: [
          "Introductions",
          "Understand current challenges",
          "Define success metrics",
          "Next steps",
        ],
        commitments: { mine: [], theirs: [] },
      };
    }

    // Build context string
    let contextStr = `Client: ${meeting.client.name}\n\n`;

    if (pastMeetings.length > 0) {
      contextStr += "### Past Meetings\n";
      for (const m of pastMeetings) {
        contextStr += `- ${m.title} (${m.startedAt?.toISOString()})\n  Summary: ${JSON.stringify(
          m.summary
        )}\n`;
      }
      contextStr += "\n";
    }

    if (openTasks.length > 0) {
      contextStr += "### Open Tasks\n";
      for (const t of openTasks) {
        contextStr += `- ${t.title} (Assignee: ${t.assigneeId})\n`;
      }
      contextStr += "\n";
    }

    if (openQuestions.length > 0) {
      contextStr += "### Open Questions\n";
      for (const q of openQuestions) {
        contextStr += `- ${q.question}\n`;
      }
      contextStr += "\n";
    }

    if (landmines.length > 0) {
      contextStr += "### Identified Risks/Constraints (Landmines)\n";
      for (const l of landmines) {
        contextStr += `- [${l.category}] ${l.content}\n`;
      }
      contextStr += "\n";
    }

    const prompt = `You are an elite executive assistant preparing a pre-meeting brief for a host.
Analyze the provided past meetings, open tasks, open questions, and risks for this client.
Generate a structured JSON brief with sentiment, tldr, suggestedAgenda, and landmines.

<context>
${contextStr}
</context>`;

    const modelName = process.env.GEMINI_TIER4_MODEL || "gemini-3.1-flash-lite";

    // Ask LLM to generate the JSON brief
    const ac = new AbortController();
    const timeoutId = setTimeout(() => ac.abort(), 15_000);

    // biome-ignore lint/suspicious/noExplicitAny: Gemini SDK response type mismatch
    let completion: any;
    try {
      completion = await getAI().models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentiment: {
                type: Type.STRING,
                description:
                  "Overall relationship tone ('Positive', 'Neutral', 'Negative', or 'Escalation Risk').",
              },
              tldr: {
                type: Type.STRING,
                description:
                  "A short paragraph (2-3 sentences max) summarizing the context, what was unresolved last time, and what needs immediate attention today. Do NOT use markdown.",
              },
              suggestedAgenda: {
                type: Type.ARRAY,
                description:
                  "An array of 3-5 short strings representing suggested agenda items based on open tasks and past meeting context.",
                items: {
                  type: Type.STRING,
                },
              },
              landmines: {
                type: Type.ARRAY,
                description:
                  "An array of objects representing true strategic risks or constraints. Pick the most critical 1-3. If none, return an empty array.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: {
                      type: Type.STRING,
                    },
                    category: {
                      type: Type.STRING,
                      description:
                        "exactly one of: 'WARNING', 'CONSTRAINT', 'RISK'",
                    },
                  },
                  required: ["text", "category"],
                },
              },
            },
            required: ["sentiment", "tldr", "suggestedAgenda", "landmines"],
          },
        },
        signal: ac.signal,
        // biome-ignore lint/suspicious/noExplicitAny: Gemini SDK response type mismatch
      } as any);
      if (completion && !completion.text) {
        completion = undefined;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    const content = completion?.text;
    if (!content) {
      throw new Error("No brief generated");
    }

    const aiOutput = JSON.parse(content);

    // Merge in the commitments accurately from the database
    const mineTasks = openTasks
      .filter((t) => t.assigneeId === targetUserId)
      .map((t) => ({ id: t.id, text: t.title, status: t.status }));
    const theirsTasks = openTasks
      .filter((t) => t.assigneeId !== targetUserId)
      .map((t) => ({ id: t.id, text: t.title, status: t.status }));

    const finalBrief = {
      tldr: aiOutput.tldr,
      sentiment: aiOutput.sentiment,
      landmines: aiOutput.landmines.map(
        (l: { text: string; category: string }) => ({
          id: randomUUID(),
          text: l.text,
          category: l.category,
        })
      ),
      suggestedAgenda: aiOutput.suggestedAgenda,
      commitments: {
        mine: mineTasks,
        theirs: theirsTasks,
      },
    };

    return finalBrief;
  },

  async generateAndSaveBrief(meetingId: string, requestUserId?: string) {
    const redisClient = getRedisClient();
    if (!redisClient) {
      throw new Error("Redis client not available");
    }

    const lockKey = `meeting:brief_lock:${meetingId}`;
    const lockToken = randomUUID();
    // biome-ignore lint/suspicious/noExplicitAny: ioredis overloads don't match
    const acquired = await (redisClient as any).set(
      lockKey,
      lockToken,
      "NX",
      "EX",
      60
    );
    if (!acquired) {
      return null;
    }

    try {
      const briefData = await this.generateBriefData(meetingId, requestUserId);
      const brief = BriefSchema.parse(briefData);

      await prisma.meeting.update({
        where: { id: meetingId },
        data: { preMeetingBrief: brief },
      });
      return brief;
    } finally {
      await redisClient.eval(
        `if redis.call("GET", KEYS[1]) == ARGV[1] then
           return redis.call("DEL", KEYS[1])
         else
           return 0
         end`,
        1,
        lockKey,
        lockToken
      );
    }
  },
};
