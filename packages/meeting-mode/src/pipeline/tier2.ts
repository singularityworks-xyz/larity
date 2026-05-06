import Groq from "groq-sdk";
import { GROQ_API_KEY, GROQ_TIER2_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Tier2Classification, Tier2Input, Tier2Outcome } from "./types";
import { tier2ClassificationSchema } from "./types";

const log = createMeetingModeLogger("tier2-classifier");

const TIER2_TIMEOUT_MS = 1500;
const TIER2_MAX_COMPLETION_TOKENS = 400;

export interface Tier2ClassifierOptions {
  timeoutMs?: number;
  invoke?: (input: Tier2Input, timeoutMs: number) => Promise<string>;
}

export class Tier2Classifier {
  private readonly groq: Groq | undefined;
  private readonly timeoutMs: number;
  private lastPromptTokens = 0;
  private lastCompletionTokens = 0;
  private readonly invoke: (
    input: Tier2Input,
    timeoutMs: number
  ) => Promise<string>;

  constructor(options: Tier2ClassifierOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? TIER2_TIMEOUT_MS;
    if (options.invoke) {
      this.groq = undefined;
      this.invoke = options.invoke;
    } else {
      this.groq = new Groq({ apiKey: GROQ_API_KEY, maxRetries: 0 });
      this.invoke = (input, timeoutMs) =>
        this.invokeGroqTier2(input, timeoutMs);
    }
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
          promptTokens: this.lastPromptTokens || 0,
          completionTokens: this.lastCompletionTokens || 0,
        };
      }

      const classification = validation.data;
      return {
        classification,
        shouldStopForDeepReasoning: shouldStopAtTier2(classification),
        promptTokens: this.lastPromptTokens || 0,
        completionTokens: this.lastCompletionTokens || 0,
      };
    } catch (error) {
      log.warn({ err: error }, "Tier2 classification failed silently");
      return {
        classification: fallbackClassification(),
        shouldStopForDeepReasoning: false,
        promptTokens: this.lastPromptTokens || 0,
        completionTokens: this.lastCompletionTokens || 0,
      };
    }
  }

  private async invokeGroqTier2(
    input: Tier2Input,
    timeoutMs: number
  ): Promise<string> {
    if (!this.groq) {
      throw new Error("Tier2 Groq client not initialized");
    }

    const completion = await this.groq.chat.completions.create(
      {
        model: GROQ_TIER2_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserMessage(input) },
        ],
        temperature: 0,
        max_tokens: TIER2_MAX_COMPLETION_TOKENS,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "Tier2Classification",
            strict: true,
            schema: getTier2JsonSchema(),
          },
        },
      },
      { timeout: timeoutMs }
    );

    const text = completion.choices[0]?.message?.content;
    if (!text?.trim()) {
      throw new Error("Groq tier2 returned empty content");
    }

    this.lastPromptTokens = completion.usage?.prompt_tokens ?? 0;
    this.lastCompletionTokens = completion.usage?.completion_tokens ?? 0;

    return text;
  }
}

/** Built once — rubric + compact calibration (system role). */
const SYSTEM_PROMPT = [
  `You are Tier 2: fast semantic classifier for live multilingual business meetings.
Output must match the JSON schema only (intent, commitmentType, tone, riskSignals, extractedData, confidence, optional topicDelta).

Classify the CURRENT utterance; use recentSameSpeaker only as short local context.

Intent rubric:
- commitment: obligation, promise, estimate, ownership, deadline, price, scope, resource, capability, or approval.
- decision: resolved choice or agreement to remember.
- question: asks info, approval, clarification, confirmation, or decision.
- concern: risk, objection, uncertainty, legal/commercial concern, discomfort.
- filler: greetings, backchannels, audibility, polite closers, noise.
- general: substantive but not above.

Risk signals (max 3, business risk only): unconditional promises, underestimation, open scope, vague deadlines/ownership, pressure, escalation, disclosure, compliance, scope creep, backtracking, risky pricing/capability.
Always include "pricing_discussed" if any specific price/amount/currency/pricing decision appears — never drop pricing.
Skip riskSignals for pure filler/STT noise unless business risk is clear.

Fields:
- commitmentType: timeline|scope|resource|price|capability|null
- tone: neutral|defensive|aggressive|hesitant|confident
- extractedData: only explicit deadline, quantity, scope, amount, currency — schema requires every key present (use null when unused)
- topicDelta: null if low-signal; else object with every key present (labelHint, decision, commitment, openQuestion, risk, owner, deadline) — use null for unused keys (Groq strict JSON schema)

English, Hindi, Hinglish, code-switching. Broken STT → lower confidence; never invent facts.

Calibration (→ expected JSON shape):
"Let's skip $400 the minimum price" → {intent:commitment,commitmentType:price,tone:confident,riskSignals:["pricing_discussed"],extractedData:{amount:400,currency:"USD"},confidence:0.9}
"$300 works fine to us. Right?" → {intent:commitment,commitmentType:price,tone:confident,riskSignals:["pricing_discussed"],extractedData:{amount:300,currency:"USD"},confidence:0.85}
"Hum char sau dollar minimum rakhenge" → {intent:commitment,commitmentType:price,tone:confident,riskSignals:["pricing_discussed"],confidence:0.85}
"I'll deliver the prototype by Friday end of day" → {intent:commitment,commitmentType:timeline,tone:confident,riskSignals:["vague_deadline"],extractedData:{deadline:"Friday end of day"},confidence:0.85}
"We can handle the design work as part of this engagement" → {intent:commitment,commitmentType:scope,tone:confident,riskSignals:["scope_creep_risk"],extractedData:{scope:"design work"},confidence:0.8}
"Yes that approach works for us let's proceed" → {intent:decision,commitmentType:scope,tone:confident,riskSignals:[],confidence:0.9}
"Okay we'll go with React for the frontend" → {intent:decision,commitmentType:capability,tone:confident,riskSignals:[],confidence:0.9}
"Let's finalize that. We'll go with one hundred dollars" → {intent:decision,commitmentType:price,tone:confident,riskSignals:["pricing_discussed"],extractedData:{amount:100,currency:"USD"},confidence:0.95}
"Is that timeline realistic with our current team" → {intent:concern,commitmentType:timeline,tone:hesitant,riskSignals:["timeline_risk"],confidence:0.85}
"I'm worried the scope will creep without defined deliverables" → {intent:concern,commitmentType:scope,tone:hesitant,riskSignals:["scope_creep_risk"],confidence:0.85}
"I think that approach makes sense overall" → {intent:general,commitmentType:null,tone:neutral,riskSignals:[],confidence:0.9}
"Let's discuss the agenda for today" → {intent:general,commitmentType:null,tone:neutral,riskSignals:[],confidence:0.9}
"Toh meeting shuru karte hain" → {intent:general,commitmentType:null,tone:neutral,riskSignals:[],confidence:0.9}
"Okay sounds good" → {intent:filler,commitmentType:null,tone:neutral,riskSignals:[],confidence:0.95}
"Am I audible right now" → {intent:filler,commitmentType:null,tone:neutral,riskSignals:[],confidence:0.95}`,
].join("\n");

function buildUserMessage(input: Tier2Input): string {
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
    `utterance: ${input.utterance}`,
    `speaker: ${JSON.stringify(speakerInfo)}`,
    `recentSameSpeaker:\n${recentBlock}`,
    `topicLabel: ${input.topicLabel ?? "unknown"}`,
    "Return only JSON.",
  ].join("\n\n");
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

  return JSON.parse(trimmed);
}

/** Groq strict JSON Schema: every key under `properties` must appear in `required`; use null for unused fields. */
function nullableString(): { anyOf: [{ type: "string" }, { type: "null" }] } {
  return { anyOf: [{ type: "string" }, { type: "null" }] };
}

function nullableNumber(): { anyOf: [{ type: "number" }, { type: "null" }] } {
  return { anyOf: [{ type: "number" }, { type: "null" }] };
}

/** JSON Schema for Groq `response_format.json_schema` (strict). */
function getTier2JsonSchema(): Record<string, unknown> {
  const topicDeltaObject = {
    type: "object",
    additionalProperties: false,
    properties: {
      labelHint: nullableString(),
      decision: nullableString(),
      commitment: nullableString(),
      openQuestion: nullableString(),
      risk: nullableString(),
      owner: nullableString(),
      deadline: nullableString(),
    },
    required: [
      "labelHint",
      "decision",
      "commitment",
      "openQuestion",
      "risk",
      "owner",
      "deadline",
    ],
  };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      intent: {
        type: "string",
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
        anyOf: [
          { type: "null" },
          {
            type: "string",
            enum: ["timeline", "scope", "resource", "price", "capability"],
          },
        ],
      },
      tone: {
        type: "string",
        enum: ["neutral", "defensive", "aggressive", "hesitant", "confident"],
      },
      riskSignals: {
        type: "array",
        items: { type: "string" },
      },
      extractedData: {
        type: "object",
        additionalProperties: false,
        properties: {
          deadline: nullableString(),
          quantity: nullableNumber(),
          scope: nullableString(),
          amount: nullableNumber(),
          currency: nullableString(),
        },
        required: ["deadline", "quantity", "scope", "amount", "currency"],
      },
      confidence: { type: "number" },
      topicDelta: {
        anyOf: [{ type: "null" }, topicDeltaObject],
      },
    },
    required: [
      "intent",
      "commitmentType",
      "tone",
      "riskSignals",
      "extractedData",
      "confidence",
      "topicDelta",
    ],
  };
}
