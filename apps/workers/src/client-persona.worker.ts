import { Type } from "@google/genai";
import { prisma } from "@larity/infra/prisma/client";
import type { ClientPersonaJobData } from "@larity/jobs";
import type { Job } from "bullmq";
import { ai } from "./lib/gemini";
import { BaseWorker } from "./worker";

const WHITESPACE_REGEX = /\s+/;

function namesAreSimilar(name1: string, name2: string) {
  if (!(name1 && name2)) {
    return false;
  }
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) {
    return true;
  }
  const t1 = n1.split(WHITESPACE_REGEX);
  const t2 = n2.split(WHITESPACE_REGEX);
  const overlappingTokens = t1.filter(
    (token) => token.length > 2 && t2.includes(token)
  );

  if (t1.length > 1 && t2.length > 1) {
    return overlappingTokens.length >= 2;
  }
  return overlappingTokens.length >= 1;
}

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
      (u) => u.speaker && namesAreSimilar(u.speaker, clientMemberName)
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
        throw new Error("Empty Gemini response for persona extraction");
      }

      const updatedPersona = JSON.parse(responseText);

      // Use the existing clientMember.persona to perform a deep merge and avoid losing nested keys
      const existingPersona = clientMember.persona || {};
      const mergedPersona = deepMerge(existingPersona, updatedPersona);

      // Update ClientMember.persona in the DB
      await prisma.clientMember.update({
        where: { id: clientMemberId },
        data: {
          // biome-ignore lint/suspicious/noExplicitAny: deepMerge returns unknown
          persona: mergedPersona as any,
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

function deepMerge(target: unknown, source: unknown): unknown {
  if (
    target &&
    typeof target === "object" &&
    !Array.isArray(target) &&
    source &&
    typeof source === "object" &&
    !Array.isArray(source)
  ) {
    const t = target as Record<string, unknown>;
    const s = source as Record<string, unknown>;
    const output = { ...t };
    for (const key of Object.keys(s)) {
      if (Array.isArray(t[key]) && Array.isArray(s[key])) {
        output[key] = Array.from(
          new Set([...(t[key] as unknown[]), ...(s[key] as unknown[])])
        );
      } else if (
        s[key] &&
        typeof s[key] === "object" &&
        !Array.isArray(s[key])
      ) {
        if (key in t) {
          output[key] = deepMerge(t[key], s[key]);
        } else {
          Object.assign(output, { [key]: s[key] });
        }
      } else {
        Object.assign(output, { [key]: s[key] });
      }
    }
    return output;
  }
  return source;
}
