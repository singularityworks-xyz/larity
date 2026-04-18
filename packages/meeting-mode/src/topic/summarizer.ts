import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_API_KEY } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { TopicState } from "./types";

const log = createMeetingModeLogger("topic-summarizer");

export class TopicSummarizer {
  private readonly ai: GoogleGenAI;
  private readonly model = "gemini-2.5-flash";

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  async summarize(
    currentState: TopicState | null,
    newUtterances: string[]
  ): Promise<Partial<TopicState>> {
    if (!newUtterances.length) {
      throw new Error("No new utterances to summarize.");
    }

    const prompt = this.buildPrompt(currentState, newUtterances);

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: this.getSchema(),
        },
      });

      if (!response.text) {
        throw new Error("Empty response text from Gemini API");
      }

      return JSON.parse(response.text) as Partial<TopicState>;
    } catch (error) {
      log.error(
        { err: error, stateId: currentState?.topicId },
        "Summarization failed"
      );
      throw error;
    }
  }

  private buildPrompt(
    currentState: TopicState | null,
    newUtterances: string[]
  ): string {
    const currentStateJSON = currentState
      ? JSON.stringify({
          label: currentState.label,
          summary: currentState.summary,
          constraintsMentioned: currentState.constraintsMentioned,
          commitmentsMentioned: currentState.commitmentsMentioned,
          riskFlags: currentState.riskFlags,
          completeness: currentState.completeness,
        })
      : "null (This is a brand new topic)";

    const utterancesText = newUtterances
      .map((u, i) => `[${i + 1}] ${u}`)
      .join("\n");

    return `
You are a real-time topic summarizer for business meetings.
Your task is to take the PREVIOUS state of a topic, ingest NEW utterances added to this topic, and output an UPDATED topic state.

CRITICAL INSTRUCTIONS:
1. Maintain existing state: Do not drop constraints, commitments, or risks unless the new utterances explicitly invalidate them.
2. Lossy compression: The "summary" field should be a short, evolving paragraph describing the entire topic discussion so far.
3. Completeness tracking:
   - "hasOwner": True ONLY if someone explicitly takes responsibility.
   - "hasDeadline": True ONLY if a specific timeline or date is agreed upon.
   - "hasExplicitConfirmation": True ONLY if multiple people agree (e.g., "Sounds good", "Approved").
4. Constraints & Risks: Only add these if they are clearly stated business or technical requirements, or serious risks.
5. If the previous state is null, generate everything from scratch based on the new utterances.

=== PREVIOUS STATE ===
${currentStateJSON}

=== NEW UTTERANCES ===
${utterancesText}

Return the updated topic state as JSON matching the schema.
`;
  }

  private getSchema() {
    return {
      type: Type.OBJECT,
      properties: {
        label: {
          type: Type.STRING,
          description: "A short, 2-5 word human-readable label for the topic.",
        },
        summary: {
          type: Type.STRING,
          description:
            "A compressed paragraph summarizing the evolving discussion.",
        },
        constraintsMentioned: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
            },
            required: ["id", "description"],
          },
        },
        commitmentsMentioned: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
              owner: { type: Type.STRING },
              dueDate: { type: Type.STRING },
            },
            required: ["id", "description"],
          },
        },
        riskFlags: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              description: { type: Type.STRING },
              severity: {
                type: Type.STRING,
                enum: ["low", "medium", "high"],
              },
            },
            required: ["id", "description", "severity"],
          },
        },
        completeness: {
          type: Type.OBJECT,
          properties: {
            hasOwner: { type: Type.BOOLEAN },
            ownerName: { type: Type.STRING },
            hasDeadline: { type: Type.BOOLEAN },
            deadline: { type: Type.STRING },
            hasActionItems: { type: Type.BOOLEAN },
            actionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            hasExplicitConfirmation: { type: Type.BOOLEAN },
          },
          required: [
            "hasOwner",
            "hasDeadline",
            "hasActionItems",
            "actionItems",
            "hasExplicitConfirmation",
          ],
        },
      },
      required: [
        "label",
        "summary",
        "constraintsMentioned",
        "commitmentsMentioned",
        "riskFlags",
        "completeness",
      ],
    };
  }
}
