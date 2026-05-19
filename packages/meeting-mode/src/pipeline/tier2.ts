import Groq from "groq-sdk";
import { GROQ_API_KEY, GROQ_TIER2_MODEL, GROQ_TIER2_TIMEOUT_MS } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Tier2Classification, Tier2Input, Tier2Outcome } from "./types";
import { tier2ClassificationSchema } from "./types";

const log = createMeetingModeLogger("tier2-classifier");

/** Groq strict `json_schema` can spend many tokens before a valid doc; 400 was too low (intermittent `max completion tokens reached`). */
const TIER2_MAX_COMPLETION_TOKENS = 1024;

export interface Tier2InvokeResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface Tier2ClassifierOptions {
  timeoutMs?: number;
  invoke?: (input: Tier2Input, timeoutMs: number) => Promise<Tier2InvokeResult>;
}

export class Tier2Classifier {
  private readonly groq: Groq | undefined;
  private readonly timeoutMs: number;
  private readonly invoke: (
    input: Tier2Input,
    timeoutMs: number
  ) => Promise<Tier2InvokeResult>;

  constructor(options: Tier2ClassifierOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? GROQ_TIER2_TIMEOUT_MS;
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
      const { text, promptTokens, completionTokens } = await this.invoke(
        input,
        this.timeoutMs
      );
      const parsed = parseTier2Response(text);
      const validation = tier2ClassificationSchema.safeParse(parsed);
      if (!validation.success) {
        log.warn(
          { issues: validation.error.issues.map((issue) => issue.message) },
          "Tier2 returned invalid schema"
        );
        return {
          classification: fallbackClassification(),
          shouldStopForDeepReasoning: false,
          promptTokens: promptTokens || 0,
          completionTokens: completionTokens || 0,
        };
      }

      const classification = validation.data;
      return {
        classification,
        shouldStopForDeepReasoning: shouldStopAtTier2(classification),
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
      };
    } catch (error) {
      log.warn({ err: error }, "Tier2 classification failed silently");
      return {
        classification: fallbackClassification(),
        shouldStopForDeepReasoning: false,
        promptTokens: 0,
        completionTokens: 0,
      };
    }
  }

  private async invokeGroqTier2(
    input: Tier2Input,
    timeoutMs: number
  ): Promise<Tier2InvokeResult> {
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

    return {
      text,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
    };
  }
}

/** Built once — rubric + compact calibration (system role). */
const SYSTEM_PROMPT = [
  `You are Tier 2: fast semantic classifier for live multilingual business meetings.
Output must match the JSON schema only. All seven top-level keys are required; all five extractedData keys are required (null when unused); topicDelta is null or a full object with all seven keys.

Classify the CURRENT utterance; use recentSameSpeaker only as short local context.

## Intent rubric — pick the FIRST that fits:

**commitment**: Any statement that creates, implies, requests, or revises a future obligation — delivery, price, timeline, scope, capability, or resource allocation.
- Affirmative: "I'll do X", "we can handle Z", "I promise", "guaranteed", "consider it done", "we'll deliver by Y", "within same budget", "no extra cost", "we'll integrate with any tool"
- Price/scope commitments: "I'll approve 30% discount", "we can build the mobile app within this budget", "99.99% uptime from day one"
- **Negative revisions of existing commitments**: "we can't make March 15th", "that timeline won't work", "we need to push delivery", "actually the price needs to be higher" — if the speaker is revising a prior promise, it is always commitment
- **Client requests that expand scope**: "can you also add X", "I assumed Y was included", "we'll need Z included" — these are commitment requests, classify as commitment with scope_creep risk signal

**decision**: A choice already resolved and agreed by the group that does NOT bind future action ("we're going with React", "that's finalized", "we decided to drop feature X").

**question**: Asks for info, approval, confirmation, or a decision.
- Does NOT include rhetorical questions that imply an unmet expectation ("I assumed X was included, right?" — this is concern/scope_creep, not question)
- Does NOT include pressure tactics disguised as questions ("your competitor already does this for free, why are you charging?" — this is concern with pressure)

**concern**: Expresses risk, objection, uncertainty, hesitation, legal/commercial worry, OR dissatisfaction with a proposal.
- Includes external pressure statements: "our CEO is watching", "your competitor offers this for free", "we'll have to go with another vendor"
- Includes downside of proposals: "that doesn't work for us", "we have a problem with X", "I'm not comfortable with that timeline"
- Includes scope creep from clients: "I assumed the data migration was included, right?" — this implies unconfirmed scope expansion

**filler**: Greeting, backchannel ("yeah", "okay", "mm-hmm", "right"), audibility check, polite closer, noise. Also includes simple acknowledgments with no substantive content.

**general**: Substantive but none of the above — analysis, context, explanation, procedural discussion with no binding, decision, or concern.
- EXCEPTION: If the utterance discusses unreleased strategy, M&A, confidential info, or internal financials that should not be shared externally, classify as general BUT include riskSignals: ["disclosure"].

## commitmentType — set when intent is commitment or decision (else null):
- timeline: binds a deadline or delivery date
- price: mentions a specific amount, currency, or pricing decision
- scope: defines what is or is not included (including negative scope: "we can't include X")
- resource: assigns people or capacity
- capability: claims ability to do something ("we can handle X", "we support Y", "our system does Z")

## Tone — describe the speaker's emotional register, not the content:
- neutral: Default conversational tone, factual delivery, no emotional charge
- confident: Assertive and self-assured, positive framing, no hedging. NOT aggressive.
- hesitant: Uncertainty, hedging ("maybe", "I think", "possibly", "sort of"), pauses, self-correction
- defensive: Deflecting blame, justifying, explaining repeatedly, "I told you already", passive-aggressive or dismissive responses to challenges
- aggressive: Sharp or hostile language, interrupting, condescending ("that's just not how X works"), personal criticism, raised intensity
- Do NOT mark confident speech about positive outcomes as aggressive. Do NOT mark factual delivery as defensive.

## Risk signals (max 3; choose only the most business-critical for the utterance):
- unconditional_promise: Absolute guarantees without qualifiers ("100%", "guarantee", "no problem at all", "always", "never fail"). NOT confident language — only over-promising.
- underestimation: Dismissing complexity ("straightforward", "easy", "no problem", "shouldn't take long", "simple"). Explicitly under-values time/effort.
- open_scope: High-ambiguity work items with no boundaries ("full integration", "entire app", "any tool", "complete rebuild", "whatever you need"). Implies unverified scope.
- vague_deadline: Missing or extremely fuzzy timeframes ("soon", "ASAP", "at some point", "later", "eventually"). Also when a deadline-critical task has no timeline assigned.
- vague_ownership: No person or team accountable ("someone should", "they'll handle it", "it'll get done", "we need to sort out"). Passive ownership with no responsible party.
- scope_creep: Expanding deliverables beyond the current agreement mid-conversation ("also add X", "I assumed Y was included", "while you're at it", "can you also"). Client casually adding features or rewriting scope.
- pressure: Urgency tactics or leverage ("CEO needs this", "deadline from above", "your competitor offers this", "we'll go elsewhere", "need answer today"). Social proof, authority pressure, ultimatums.
- timeline_risk: Timeline that contradicts known constraints or seems impossible under current scope. Overlaps with backtracking but specifically about time contradictions.
- backtracking: Reversing or walking back a previous statement ("actually we need", "I know we said X but", "that was never confirmed", "we didn't agree to that"). Denying or revising prior commitments.
- disclosure: Promising to share, expose, or give access to data that may be confidential (client data, internal figures, PII, passwords, API keys, unreleased plans, M&A strategy). "I can share X", "I'll send you Y", "let me give you access".
- compliance: Regulatory or legal noncompliance risk (GDPR, HIPAA, data storage, privacy, data residency). Mentions of storing PII unsafely or mishandling sensitive data.
- manipulation: Emotional manipulation or psychological leverage — guilt-tripping ("after everything we've done for you"), playing victim ("you'll put us out of business with these rates"), false urgency ("my job depends on this", "I'll be fired if"), flattery-as-leverage ("you're the best, that's why we need you to"), or manufactured emotional stakes ("our entire quarter rides on this"). Different from pressure (explicit deadlines/ultimatums from authority) — manipulation uses guilt, obligation, or emotional debt.
- escalation: Rapid raising of stakes (involving executives, legal, or external parties suddenly; threatening to escalate disputes).
- pricing_discussed: Any specific price, amount, currency, discount, or rate mentioned — even as a hypothetical. This is a factual marker, always include it when money is mentioned.

## Other rules:
- Always include "pricing_discussed" when any specific price/amount/currency/discount/rate appears — never omit it.
- Skip riskSignals for pure filler or STT noise.
- extractedData: fill only from explicit speech; never infer. Use null for any key not present.
- topicDelta: null unless the utterance carries a clear topic signal; if set, include all seven keys (unused ones null).
- English, Hindi, Hinglish, code-switching. Broken STT → lower confidence; never invent facts.

## Examples:
{"intent":"commitment","commitmentType":"timeline","tone":"confident","riskSignals":["vague_deadline"],"extractedData":{"deadline":"end of this month","quantity":null,"scope":"integration","amount":null,"currency":null},"confidence":0.9,"topicDelta":null}
{"intent":"commitment","commitmentType":"price","tone":"confident","riskSignals":["pricing_discussed"],"extractedData":{"deadline":null,"quantity":null,"scope":null,"amount":2500,"currency":"USD"},"confidence":0.9,"topicDelta":null}
{"intent":"filler","commitmentType":null,"tone":"neutral","riskSignals":[],"extractedData":{"deadline":null,"quantity":null,"scope":null,"amount":null,"currency":null},"confidence":0.95,"topicDelta":null}
{"intent":"concern","commitmentType":null,"tone":"hesitant","riskSignals":["scope_creep","pressure"],"extractedData":{"deadline":null,"quantity":null,"scope":null,"amount":null,"currency":null},"confidence":0.85,"topicDelta":null}
{"intent":"concern","commitmentType":null,"tone":"hesitant","riskSignals":["manipulation","pricing_discussed"],"extractedData":{"deadline":null,"quantity":null,"scope":null,"amount":null,"currency":null},"confidence":0.8,"topicDelta":null}`,
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
    input.structuralPricingCue ? "pricingCue: true" : "pricingCue: false",
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
