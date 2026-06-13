import { z } from "zod";
import type { Commitment } from "../commitment/types";
import type { Constraint } from "../constraint/types";
import type { SpeakerStateSummary } from "../speaker-state/types";
import type { SpeakerIdentity, Utterance } from "../utterance/types";

export const tier2IntentSchema = z.enum([
  "commitment",
  "decision",
  "question",
  "concern",
  "filler",
  "general",
]);

export const tier2CommitmentTypeSchema = z.enum([
  "timeline",
  "scope",
  "resource",
  "price",
  "capability",
]);

export const tier2ToneSchema = z.enum([
  "neutral",
  "defensive",
  "aggressive",
  "hesitant",
  "confident",
]);

/** Strip Groq strict-schema null placeholders before optional Zod fields */
function optionalTier2String(max: number) {
  return z.preprocess(
    (val) =>
      val === null || val === undefined || val === "" ? undefined : val,
    z.string().min(1).max(max).optional()
  );
}

function optionalTier2Number() {
  return z.preprocess(
    (val) => (val === null || val === undefined ? undefined : val),
    z.number().finite().optional()
  );
}

export const tier2TopicDeltaSchema = z
  .object({
    labelHint: optionalTier2String(200),
    decision: optionalTier2String(300),
    commitment: optionalTier2String(300),
    openQuestion: optionalTier2String(300),
    risk: optionalTier2String(300),
    owner: optionalTier2String(120),
    deadline: optionalTier2String(120),
  })
  .strict();

export const tier2ClassificationSchema = z
  .object({
    intent: tier2IntentSchema,
    commitmentType: tier2CommitmentTypeSchema.nullable(),
    tone: tier2ToneSchema,
    riskSignals: z.array(z.string().min(1).max(200)).max(20),
    extractedData: z
      .object({
        deadline: optionalTier2String(120),
        quantity: optionalTier2Number(),
        scope: optionalTier2String(300),
        amount: optionalTier2Number(),
        currency: optionalTier2String(12),
      })
      .strict(),
    confidence: z.number().min(0).max(1),
    topicDelta: z.preprocess(
      (val) => (val === null ? undefined : val),
      tier2TopicDeltaSchema.optional()
    ),
    identityGuess: z.preprocess(
      (val) => (val === null ? undefined : val),
      z
        .object({
          index: z.string(),
          memberId: z.string(),
        })
        .strict()
        .optional()
    ),
  })
  .strict();

export type Tier2Classification = z.infer<typeof tier2ClassificationSchema>;
export type Tier2TopicDelta = z.infer<typeof tier2TopicDeltaSchema>;

export interface Tier2Input {
  utterance: string;
  speaker: SpeakerIdentity;
  recentSameSpeaker: string[];
  topicLabel?: string;
  /** Structural price/currency cue (aligned with Tier1 `pricingHit`) for Tier2 user message. */
  structuralPricingCue?: boolean;
  knownClientMembers?: Array<{ id: string; name: string }>;
}

export type Tier2Intent = z.infer<typeof tier2IntentSchema>;

export interface Tier1Detection {
  type:
    | "date_time"
    | "number"
    | "blocklist_keyword"
    | "technical_pattern"
    | "client_name";
  value: string;
}

export interface Tier1Result {
  detections: Tier1Detection[];
  technicalHit: boolean;
  blocklistHit: boolean;
  /** True when the utterance contains a currency/price mention (e.g. $400, 300 rupees, €50).
   *  Drives the highSignal gate independently of Tier 2 classification quality. */
  pricingHit: boolean;
}

export interface Tier2Outcome {
  classification: Tier2Classification;
  shouldStopForDeepReasoning: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export interface Tier3Result {
  forceTier4: boolean;
  noveltyScore: number;
  memoryMatches: Array<{ type: string; id: string; score: number }>;
  ledgerMatches: Array<{ id: string; score: number }>;
}

/** Historical memory hydrated for Tier 4 prompts */
export interface Tier4HistoricalMatch {
  memoryType: string;
  sourceId: string;
  item: string;
  meetingDate?: string;
  status?: string;
  similarity: number;
}

/** Ledger match hydrated with full commitment for Tier 4 */
export interface Tier4CommitmentMatch {
  commitment: Commitment;
  similarity: number;
}

/** Rich context assembled after Tiers 1–3 gate for Tier 4 */
export interface Tier4Context {
  triggerUtteranceId: string;
  utterance: string;
  speaker: SpeakerIdentity;
  topicId: string | undefined;
  topicSummary: string;
  tier1Result: Tier1Result;
  tier2Classification: Tier2Classification;
  recentUtterances: Utterance[];
  matchedHistoricalItems: Tier4HistoricalMatch[];
  matchedCommitments: Tier4CommitmentMatch[];
  relevantConstraints: Constraint[];
  speakerStates?: SpeakerStateSummary[];
}

export const tier4AlertTypeLiterals = [
  "none",
  "self_contradiction",
  "team_inconsistency",
  "risky_commitment",
  "scope_creep",
  "client_backtrack",
  "missing_clarity",
  "information_risk",
  "tone_warning",
  "pressure_detected",
  "policy_violation",
  "client_disengagement",
  "undiscussed_agenda",
] as const;

export type Tier4AlertKind = (typeof tier4AlertTypeLiterals)[number];

/** Zod expects a tuple; keep aligned with Tier4AlertKind */
export const tier4AlertTypeSchema = z.enum(
  tier4AlertTypeLiterals as unknown as readonly [
    Tier4AlertKind,
    ...Tier4AlertKind[],
  ]
);

export const tier4SeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const tier4RoutingSchema = z.enum(["shared", "personal", "both"]);

export const tier4ResponseSchema = z
  .object({
    alertType: tier4AlertTypeSchema,
    severity: tier4SeveritySchema,
    message: z.string().min(1).max(480),
    /** One short user-visible line (shown in overlay): why this alert fired */
    surfaceReason: z.preprocess(
      (val) => (val === null ? undefined : val),
      z.string().min(1).max(240).optional()
    ),
    suggestion: z.preprocess(
      (val) => (val === null ? undefined : val),
      z.string().min(1).max(520).optional()
    ),
    confidence: z.number().min(0).max(1),
    shouldSurface: z.boolean(),
    reasoning: z.string().min(1).max(1500),
    routing: tier4RoutingSchema,
    targetUserId: z.preprocess(
      (val) => (val === null ? undefined : val),
      z.string().min(1).max(120).optional()
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (!data.shouldSurface || data.alertType === "none") {
      return;
    }
    const reason = data.surfaceReason?.trim() ?? "";
    if (reason.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "surfaceReason must be a concise one-line rationale when surfacing",
        path: ["surfaceReason"],
      });
    }
    const sug =
      typeof data.suggestion === "string" ? data.suggestion.trim() : "";
    if (sug.length < 12) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "suggestion must give 1-2 short actionable next-step lines when surfacing",
        path: ["suggestion"],
      });
    }
  });

export type Tier4Response = z.infer<typeof tier4ResponseSchema>;
