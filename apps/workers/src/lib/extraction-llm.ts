import { Type } from "@google/genai";
import { ai } from "./gemini";

export const EXTRACTION_MODEL = "gemini-3.1-flash-lite";
const EXTRACTION_TIMEOUT_MS = 30_000; // 30s timeout for bulk extraction

export interface ExtractedDecision {
  title: string;
  content: string;
  rationale?: string;
  evidence?: string;
  tags: string[];
  speakerAttribution?: string;
}

export interface ExtractedTask {
  title: string;
  description?: string;
  assigneeHint?: string;
  dueAt?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface ExtractedOpenQuestion {
  question: string;
  context?: string;
  assigneeHint?: string;
  dueAt?: string;
}

export interface ExtractedImportantPoint {
  content: string;
  category:
    | "COMMITMENT"
    | "CONSTRAINT"
    | "INSIGHT"
    | "WARNING"
    | "RISK"
    | "OPPORTUNITY";
  speakerHint?: string;
  transcriptEvidence?: string;
}

export interface ChunkExtractionResult {
  decisions: ExtractedDecision[];
  tasks: ExtractedTask[];
  openQuestions: ExtractedOpenQuestion[];
  importantPoints: ExtractedImportantPoint[];
}

function getGeminiExtractionSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      decisions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            rationale: { type: Type.STRING, nullable: true },
            evidence: { type: Type.STRING, nullable: true },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            speakerAttribution: { type: Type.STRING, nullable: true },
          },
          required: ["title", "content", "tags"],
        },
      },
      tasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING, nullable: true },
            assigneeHint: { type: Type.STRING, nullable: true },
            dueAt: { type: Type.STRING, nullable: true },
            priority: {
              type: Type.STRING,
              enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            },
          },
          required: ["title", "priority"],
        },
      },
      openQuestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            question: { type: Type.STRING },
            context: { type: Type.STRING, nullable: true },
            assigneeHint: { type: Type.STRING, nullable: true },
            dueAt: { type: Type.STRING, nullable: true },
          },
          required: ["question"],
        },
      },
      importantPoints: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING },
            category: {
              type: Type.STRING,
              enum: [
                "COMMITMENT",
                "CONSTRAINT",
                "INSIGHT",
                "WARNING",
                "RISK",
                "OPPORTUNITY",
              ],
            },
            speakerHint: { type: Type.STRING, nullable: true },
            transcriptEvidence: { type: Type.STRING, nullable: true },
          },
          required: ["content", "category"],
        },
      },
    },
    required: ["decisions", "tasks", "openQuestions", "importantPoints"],
  };
}

const SYSTEM_INSTRUCTION = `You are a world-class executive assistant and business intelligence system. Your goal is to extract key takeaways from a portion of a meeting transcript.
Specifically, extract:
1. Decisions: Formal resolutions, choices, or agreements made during the discussion.
2. Tasks (Action Items): Explicit or implicit tasks assigned to a specific person or team.
3. Open Questions: Questions raised during the meeting that were left unresolved or tabled for later.
4. Important Points: High-signal statements classified as COMMITMENT (promises made), CONSTRAINT (limitations/requirements), INSIGHT (valuable takeaways), WARNING (threats or alerts), RISK (potential failures), or OPPORTUNITY (potential gains).

Extract hints for assignees/speakers/evidence exactly as they appear in the transcript (e.g. speaker names or speaker labels). For dates, try to parse relative dates into ISO format based on the context, or leave them blank. Ensure your output is highly professional and ready for a dashboard. Keep titles clear and concise.`;

export async function extractInsightsFromTranscriptChunk(
  transcriptText: string,
  contextMetadata?: string
): Promise<ChunkExtractionResult> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    EXTRACTION_TIMEOUT_MS
  );

  try {
    let prompt = `## Meeting Segment Transcript:\n\n${transcriptText}\n\n`;
    if (contextMetadata) {
      prompt = `## Context / Agenda / Participants:\n${contextMetadata}\n\n${prompt}`;
    }
    prompt +=
      "Extract all decisions, tasks, open questions, and important points. Return them in the requested JSON structure.";

    const response = await ai.models.generateContent({
      model: EXTRACTION_MODEL,
      contents: prompt,
      config: {
        temperature: 0.1,
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: getGeminiExtractionSchema(),
        abortSignal: controller.signal,
      },
    });

    if (!response.text) {
      throw new Error("Empty response received from Gemini extraction");
    }

    const result = JSON.parse(response.text) as ChunkExtractionResult;
    return {
      decisions: result.decisions || [],
      tasks: result.tasks || [],
      openQuestions: result.openQuestions || [],
      importantPoints: result.importantPoints || [],
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Gemini meeting extraction timed out");
    }
    console.error("Gemini extraction failed:", error);
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
