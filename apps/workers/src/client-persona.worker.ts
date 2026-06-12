import { Type } from "@google/genai";
import { prisma } from "@larity/infra/prisma/client";
import type { ClientPersonaJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { ai } from "./lib/gemini";
import { BaseWorker } from "./worker";

export class ClientPersonaWorker extends BaseWorker<
  ClientPersonaJobData,
  { success: boolean }
> {
  constructor() {
    super("client.personaExtraction");
  }

  async process(job: Job<ClientPersonaJobData>): Promise<{ success: boolean }> {
    const { clientMemberId, meetingId } = job.data;
    this.log.info(
      { clientMemberId, meetingId },
      "Starting persona extraction for client member"
    );

    const clientMember = await prisma.clientMember.findUnique({
      where: { id: clientMemberId },
    });

    if (!clientMember) {
      this.log.warn({ clientMemberId }, "Client member not found, skipping");
      return { success: false };
    }

    // Get the transcript
    const transcript = await prisma.transcript.findUnique({
      where: { meetingId },
    });

    if (!transcript) {
      this.log.warn({ meetingId }, "Transcript not found, skipping");
      return { success: false };
    }

    let utterances: Array<{ speaker: string; text: string }> = [];
    try {
      utterances = JSON.parse(transcript.content);
    } catch (err) {
      this.log.error({ err }, "Failed to parse transcript");
      return { success: false };
    }

    const clientMemberName = clientMember.name;
    const clientUtterances = utterances.filter(
      (u) =>
        u.speaker &&
        u.speaker.toLowerCase().trim() === clientMemberName.toLowerCase().trim()
    );

    if (clientUtterances.length === 0) {
      this.log.info(
        { clientMemberId },
        "No utterances found for this client member, skipping"
      );
      return { success: true };
    }

    const utterancesText = clientUtterances
      .map((u) => `[${u.speaker}]: ${u.text}`)
      .join("\n");

    const currentPersonaStr = clientMember.persona
      ? JSON.stringify(clientMember.persona, null, 2)
      : "None";

    const prompt = `You are an expert AI persona analyzer for B2B meetings.
Your task is to analyze a set of utterances spoken by a specific client member and update their behavioral persona.

You will be given:
1. The CURRENT persona for this client member (if any).
2. The list of utterances spoken by them in the most recent meeting.

Extract insights about the speaker such as:
- Tone (e.g. decisive, analytical, hesitant, demanding)
- Likes/Dislikes
- Communication style
- Key priorities or concerns they consistently raise
- Personality quirks

Output a JSON object that represents the updated persona. This JSON will be merged (or replace) the old persona.

If the current persona has useful information, preserve it or enhance it. Do not discard older insights unless contradicted by strong new evidence.

CURRENT PERSONA:
${currentPersonaStr}

RECENT UTTERANCES:
${utterancesText}
`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.STRING },
              likes: { type: Type.ARRAY, items: { type: Type.STRING } },
              dislikes: { type: Type.ARRAY, items: { type: Type.STRING } },
              communicationStyle: { type: Type.STRING },
              keyPriorities: { type: Type.ARRAY, items: { type: Type.STRING } },
              notes: { type: Type.STRING },
            },
          },
          temperature: 0.2,
        },
      });

      const responseText = response.text;
      if (!responseText) {
        this.log.warn("Empty response from Gemini");
        return { success: false };
      }

      const updatedPersona = JSON.parse(responseText);

      await prisma.clientMember.update({
        where: { id: clientMemberId },
        data: {
          persona: updatedPersona,
        },
      });

      this.log.info({ clientMemberId }, "Successfully updated client persona");
      return { success: true };
    } catch (error) {
      this.log.error({ err: error }, "Failed to extract or update persona");
      throw error;
    }
  }
}
