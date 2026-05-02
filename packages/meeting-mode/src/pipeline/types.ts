import { z } from "zod";
import type { SpeakerIdentity } from "../utterance/types";

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

export const tier2TopicDeltaSchema = z
  .object({
    labelHint: z.string().min(1).max(200).optional(),
    decision: z.string().min(1).max(300).optional(),
    commitment: z.string().min(1).max(300).optional(),
    openQuestion: z.string().min(1).max(300).optional(),
    risk: z.string().min(1).max(300).optional(),
    owner: z.string().min(1).max(120).optional(),
    deadline: z.string().min(1).max(120).optional(),
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
        deadline: z.string().min(1).max(120).optional(),
        quantity: z.number().finite().optional(),
        scope: z.string().min(1).max(300).optional(),
        amount: z.number().finite().optional(),
        currency: z.string().min(1).max(12).optional(),
      })
      .strict(),
    confidence: z.number().min(0).max(1),
    topicDelta: tier2TopicDeltaSchema.optional(),
  })
  .strict();

export type Tier2Classification = z.infer<typeof tier2ClassificationSchema>;
export type Tier2TopicDelta = z.infer<typeof tier2TopicDeltaSchema>;

export interface Tier2Input {
  utterance: string;
  speaker: SpeakerIdentity;
  recentSameSpeaker: string[];
  topicLabel?: string;
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
}

export interface Tier2Outcome {
  classification: Tier2Classification;
  shouldStopForDeepReasoning: boolean;
}

export interface Tier3Result {
  forceTier4: boolean;
  noveltyScore: number;
  memoryMatches: Array<{ type: string; id: string; score: number }>;
  ledgerMatches: Array<{ id: string; score: number }>;
}
