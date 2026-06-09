import { Type } from "@google/genai";
import type { MeetingAnalysis } from "@larity/infra/prisma/meeting-analysis.types";
import type {
  ExtractedDecision,
  ExtractedImportantPoint,
  ExtractedOpenQuestion,
  ExtractedTask,
} from "./extraction-llm";
import { EXTRACTION_MODEL } from "./extraction-llm";
import { ai } from "./gemini";
import type { TalkTimeStats } from "./talk-time";

const EVIDENCE_CLEANUP_REGEX = /^\[[^\]]+\]:\s*/;
const MARKDOWN_HEADER_REGEX = /^#{1,6}\s+/gm;
const HR_REGEX = /^-{3,}$/gm;

function sanitizeForPrompt(text: string, maxLength = 300): string {
  if (!text) {
    return "";
  }
  return text
    .replace(MARKDOWN_HEADER_REGEX, "")
    .replace(HR_REGEX, "")
    .slice(0, maxLength);
}

export interface FinalAnalysisInput {
  meetingTitle: string;
  clientName: string;
  participants: {
    name: string;
    role: "TEAM_MEMBER" | "EXTERNAL" | "UNKNOWN";
  }[];
  decisions: ExtractedDecision[];
  tasks: ExtractedTask[];
  openQuestions: ExtractedOpenQuestion[];
  importantPoints: ExtractedImportantPoint[];
  talkTimeStats: TalkTimeStats;
  durationSeconds: number;
  utterances: { speaker: string; text: string; timestamp: number }[];
}

const FINAL_ANALYSIS_TIMEOUT_MS = 30_000;

function getGeminiAnalysisSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      purpose: {
        type: Type.STRING,
        description:
          "A 1-2 sentence explanation of why the meeting was held and its main focus.",
      },
      outcome: {
        type: Type.STRING,
        description:
          "A 1-2 sentence summary of what was accomplished or decided in the meeting.",
      },
      prose: {
        type: Type.STRING,
        description:
          "A detailed, professional executive summary paragraph of the meeting's main discussions and flow.",
      },
      tone: {
        type: Type.STRING,
        enum: ["POSITIVE", "NEUTRAL", "TENSE", "MIXED"],
        description: "The overall vibe/tone of the meeting.",
      },
      clientSentiment: {
        type: Type.STRING,
        enum: ["ENTHUSIASTIC", "INTERESTED", "NEUTRAL", "SKEPTICAL", "HOSTILE"],
        description:
          "The client's sentiment evaluated from external speakers' statements, questions, and reactions.",
      },
      keyMoments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            timestamp: {
              type: Type.INTEGER,
              description:
                "The exact timestamp of the moment in seconds from the start of the meeting.",
            },
            description: {
              type: Type.STRING,
              description:
                "A concise description of what happened in this moment (e.g., 'Client challenged team size' or 'Team proposed new timeline').",
            },
            category: {
              type: Type.STRING,
              enum: [
                "DECISION",
                "TASK",
                "RISK",
                "COMMITMENT",
                "WARNING",
                "INSIGHT",
                "OPPORTUNITY",
              ],
              description:
                "The category/type of the moment (e.g., 'DECISION', 'TASK', 'RISK', 'COMMITMENT', 'WARNING', 'INSIGHT').",
            },
          },
          required: ["timestamp", "description", "category"],
        },
      },
    },
    required: [
      "purpose",
      "outcome",
      "prose",
      "tone",
      "clientSentiment",
      "keyMoments",
    ],
  };
}

const SYSTEM_INSTRUCTION = `You are a world-class business intelligence and meeting analysis system.
Your goal is to synthesize the extracted meeting items (decisions, tasks, questions, risks, commitments, etc.) into a cohesive, structured meeting analysis.
Review the provided meeting context, the talk time statistics of participants, and the list of extracted items along with their timestamps.

Based ONLY on this information:
1. Synthesize a brief 'purpose' of the meeting.
2. Summarize the 'outcome' of the meeting.
3. Write a professional, detailed 'prose' summary of the meeting flow.
4. Assess the overall meeting 'tone' and the 'clientSentiment' (sentiment of the external client participants).
5. Select the top key moments (up to 5-7 high-signal points) from the meeting. Use the exact timestamps provided in the input items to populate their timestamps.

Do NOT make up any details or invent decisions, tasks, or commitments that are not present in the input items. Keep descriptions professional, objective, and clear.`;

export async function generateMeetingAnalysis(
  input: FinalAnalysisInput
): Promise<
  Omit<
    MeetingAnalysis,
    "speakers" | "durationSeconds" | "participantCount" | "generatedAt"
  >
> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    FINAL_ANALYSIS_TIMEOUT_MS
  );

  try {
    const lcUtterances = input.utterances.map((u) => ({
      timestamp: u.timestamp,
      text: u.text.toLowerCase(),
    }));

    // Helper to find timestamp of an item from its evidence
    const findTimestamp = (evidence: string | undefined): number | null => {
      if (!evidence) {
        return null;
      }
      const cleanEvidence = evidence
        .replace(EVIDENCE_CLEANUP_REGEX, "")
        .trim()
        .toLowerCase();
      if (!cleanEvidence) {
        return null;
      }
      const snippet = cleanEvidence.slice(0, 60);
      for (const u of lcUtterances) {
        if (u.text.includes(snippet)) {
          return u.timestamp;
        }
      }
      return null;
    };

    const fmtTs = (ts: number | null) => (ts !== null ? ` (at ${ts}s)` : "");

    // Format decisions with timestamps
    const decisionsFormatted = input.decisions
      .map((d) => {
        const ts = findTimestamp(d.evidence);
        return `- Title: ${sanitizeForPrompt(d.title)}${fmtTs(ts)}\n  Content: ${sanitizeForPrompt(d.content)}\n  Speaker: ${sanitizeForPrompt(d.speakerAttribution || "Unknown")}`;
      })
      .join("\n");

    // Format tasks
    const tasksFormatted = input.tasks
      .map((t) => {
        return `- Title: ${sanitizeForPrompt(t.title)}\n  Priority: ${t.priority}\n  Assignee Hint: ${sanitizeForPrompt(t.assigneeHint || "None")}`;
      })
      .join("\n");

    // Format open questions
    const openQuestionsFormatted = input.openQuestions
      .map((q) => {
        return `- Question: ${sanitizeForPrompt(q.question)}\n  Assignee Hint: ${sanitizeForPrompt(q.assigneeHint || "None")}`;
      })
      .join("\n");

    // Format important points by category
    const pointsByCategory: Record<string, string[]> = {};
    for (const p of input.importantPoints) {
      if (!pointsByCategory[p.category]) {
        pointsByCategory[p.category] = [];
      }
      const ts = findTimestamp(p.transcriptEvidence);
      pointsByCategory[p.category].push(
        `- Content: ${sanitizeForPrompt(p.content)}${fmtTs(ts)}\n  Speaker: ${sanitizeForPrompt(p.speakerHint || "Unknown")}`
      );
    }
    const pointsFormatted = Object.entries(pointsByCategory)
      .map(([cat, list]) => `### Category: ${cat}\n${list.join("\n")}`)
      .join("\n\n");

    // Format talk time stats
    const talkTimeFormatted = Object.entries(input.talkTimeStats)
      .map(
        ([speaker, stat]) =>
          `- ${sanitizeForPrompt(speaker)}: ${stat.talkTimePercent}% (${stat.totalSeconds}s, ${stat.utteranceCount} utterances)`
      )
      .join("\n");

    const prompt = `## Meeting Context
Title: ${sanitizeForPrompt(input.meetingTitle)}
Client: ${sanitizeForPrompt(input.clientName)}
Duration: ${input.durationSeconds}s
Participants:
${input.participants.map((p) => `- Name: ${sanitizeForPrompt(p.name)}, Role: ${p.role}`).join("\n")}

## Talk Time Statistics
${talkTimeFormatted}

## Extracted Decisions
${decisionsFormatted || "None"}

## Extracted Tasks
${tasksFormatted || "None"}

## Extracted Open Questions
${openQuestionsFormatted || "None"}

## Extracted Important Points / Signals
${pointsFormatted || "None"}

## Instructions
Synthesize the above items into the requested JSON schema. Assign correct timestamps to key moments using the "(at Ns)" hints in the extracted items above.`;

    const response = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: prompt,
      config: {
        temperature: 0.2,
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: getGeminiAnalysisSchema(),
        abortSignal: controller.signal,
      },
    });

    if (!response.text) {
      throw new Error("Empty response received from Gemini meeting analysis");
    }

    const result = JSON.parse(response.text);
    return {
      schemaVersion: 1,
      purpose: result.purpose || "",
      outcome: result.outcome || "",
      prose: result.prose || "",
      tone: result.tone || "NEUTRAL",
      clientSentiment: result.clientSentiment || "NEUTRAL",
      keyMoments: result.keyMoments || [],
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Gemini meeting analysis synthesis timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
