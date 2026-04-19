import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_API_KEY, GEMINI_TIER2_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Tier2Classification, Tier2Input, Tier2Outcome } from "./types";
import { tier2ClassificationSchema } from "./types";

const log = createMeetingModeLogger("tier2-classifier");

const TIER2_TIMEOUT_MS = 200;

export interface Tier2ClassifierOptions {
  timeoutMs?: number;
  invoke?: (input: Tier2Input, timeoutMs: number) => Promise<string>;
}

export class Tier2Classifier {
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly invoke: (
    input: Tier2Input,
    timeoutMs: number
  ) => Promise<string>;

  constructor(options: Tier2ClassifierOptions = {}) {
    this.ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    this.timeoutMs = options.timeoutMs ?? TIER2_TIMEOUT_MS;
    this.invoke =
      options.invoke ??
      ((input, timeoutMs) => this.invokeGeminiTier2(input, timeoutMs));
  }

  async classify(input: Tier2Input): Promise<Tier2Outcome> {
    try {
      const raw = await this.invoke(input, this.timeoutMs);
      const parsed = parseTier2Response(raw);
      const validation = tier2ClassificationSchema.safeParse(parsed);
      if (!validation.success) {
        log.warn(
          { issues: validation.error.issues.map((issue) => issue.message) },
          "Tier2 returned invalid schema"
        );
        return {
          classification: fallbackClassification(),
          shouldStopForDeepReasoning: false,
        };
      }

      const classification = validation.data;
      return {
        classification,
        shouldStopForDeepReasoning: shouldStopAtTier2(classification),
      };
    } catch (error) {
      log.warn({ err: error }, "Tier2 classification failed silently");
      return {
        classification: fallbackClassification(),
        shouldStopForDeepReasoning: false,
      };
    }
  }

  private async invokeGeminiTier2(
    input: Tier2Input,
    timeoutMs: number
  ): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutHandle = setTimeout(() => {
        clearTimeout(timeoutHandle);
        reject(new Error("Tier2 Gemini timeout"));
      }, timeoutMs);
    });

    const call = this.ai.models.generateContent({
      model: GEMINI_TIER2_MODEL,
      contents: buildPrompt(input),
      config: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: getTier2ResponseSchema(),
      },
    });

    const response = await Promise.race([call, timeoutPromise]);

    if (!response.text) {
      throw new Error("Gemini tier2 returned empty content");
    }

    return response.text;
  }
}

function fallbackClassification(): Tier2Classification {
  return {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    extractedData: {},
    confidence: 0,
  };
}

function shouldStopAtTier2(classification: Tier2Classification): boolean {
  const lowSignalIntent =
    classification.intent === "filler" || classification.intent === "general";

  return (
    lowSignalIntent &&
    classification.riskSignals.length === 0 &&
    classification.confidence > 0.8
  );
}

function parseTier2Response(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Tier2 returned empty response");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Tier2 response did not contain JSON");
    }

    const jsonChunk = trimmed.slice(firstBrace, lastBrace + 1);
    return JSON.parse(jsonChunk);
  }
}

function buildPrompt(input: Tier2Input): string {
  const recentBlock = input.recentSameSpeaker.length
    ? input.recentSameSpeaker
        .map((utterance, index) => `${index + 1}. ${utterance}`)
        .join("\n")
    : "None";

  const speakerInfo = {
    speakerId: input.speaker.speakerId,
    type: input.speaker.type,
    name: input.speaker.name,
    isCurrentUser: input.speaker.isCurrentUser,
  };

  return [
    `You are Tier 2 classifier for live multilingual business meetings.
Return strict JSON only with fields: intent, commitmentType, tone, riskSignals, extractedData, confidence, topicDelta.
Rules:
- intent: one of commitment|decision|question|concern|filler|general
- commitmentType: timeline|scope|resource|price|capability|null
- tone: neutral|defensive|aggressive|hesitant|confident
- riskSignals: concise semantic risk labels
- extractedData: deadline, quantity, scope, amount, currency when present
- topicDelta: optional deterministic updates for reducer keys labelHint, decision, commitment, openQuestion, risk, owner, deadline
- Use context from recent utterances by same speaker
- Work for any language including English, Hindi, and Hinglish
- If uncertain, lower confidence and avoid hallucinating`.trim(),
    `utterance: ${input.utterance}`,
    `speaker: ${JSON.stringify(speakerInfo)}`,
    `recentSameSpeaker:\n${recentBlock}`,
    `topicLabel: ${input.topicLabel ?? "unknown"}`,
    "Return only JSON.",
  ].join("\n\n");
}

function getTier2ResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      intent: {
        type: Type.STRING,
        enum: [
          "commitment",
          "decision",
          "question",
          "concern",
          "filler",
          "general",
        ],
      },
      commitmentType: {
        type: Type.STRING,
        nullable: true,
        enum: ["timeline", "scope", "resource", "price", "capability"],
      },
      tone: {
        type: Type.STRING,
        enum: ["neutral", "defensive", "aggressive", "hesitant", "confident"],
      },
      riskSignals: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
        },
      },
      extractedData: {
        type: Type.OBJECT,
        properties: {
          deadline: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          scope: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          currency: { type: Type.STRING },
        },
      },
      confidence: {
        type: Type.NUMBER,
      },
      topicDelta: {
        type: Type.OBJECT,
        nullable: true,
        properties: {
          labelHint: { type: Type.STRING },
          decision: { type: Type.STRING },
          commitment: { type: Type.STRING },
          openQuestion: { type: Type.STRING },
          risk: { type: Type.STRING },
          owner: { type: Type.STRING },
          deadline: { type: Type.STRING },
        },
      },
    },
    required: [
      "intent",
      "commitmentType",
      "tone",
      "riskSignals",
      "extractedData",
      "confidence",
    ],
  };
}
