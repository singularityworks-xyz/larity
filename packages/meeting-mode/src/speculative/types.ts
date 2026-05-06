import type { Tier1Result, Tier2Classification } from "../pipeline/types";
import type { SpeakerIdentity } from "../utterance/types";

export const SPECULATIVE_CONFIDENCE_THRESHOLD = 0.7;

export const SPECULATIVE_MISMATCH_THRESHOLD = 0.3;

export const SPECULATIVE_MAX_ENTRIES_PER_SESSION = Number.parseInt(
  process.env.SPECULATIVE_CACHE_SIZE || "100",
  10
);

export const SPECULATIVE_TTL_MS = 10_000;

export interface PartialUtterance {
  readonly sessionId: string;
  readonly speaker: SpeakerIdentity;
  readonly text: string;
  readonly confidence: number;
  readonly timestamp: number;
}

export interface SpeculativeResult {
  readonly partialText: string;
  readonly classification: Tier2Classification;
  readonly tier1Result: Tier1Result;
  readonly predictedTopicId?: string;
  readonly createdAt: number;
}

export interface SpeculativeMatch {
  readonly matched: boolean;
  readonly result: SpeculativeResult | null;
  readonly mismatchRatio: number;
}

export type SpeakerProcessingPriority = "high" | "standard" | "low";

export function getSpeakerProcessingPriority(
  speaker: SpeakerIdentity
): SpeakerProcessingPriority {
  if (speaker.isCurrentUser) {
    return "high";
  }
  if (speaker.type === "TEAM") {
    return "standard";
  }
  return "low";
}

export const SPEAKER_AWARE_TIER4_CONFIDENCE: Record<
  SpeakerProcessingPriority,
  number
> = {
  high: 0.7,
  standard: 0.8,
  low: 0.85,
} as const;

export const SILENT_COLLABORATOR_THRESHOLDS: Record<
  import("../alerts/types").AlertCategory,
  number
> = {
  policy_violation: 0.6,
  information_risk: 0.6,
  self_contradiction: 0.65,
  team_inconsistency: 0.7,
  client_backtrack: 0.7,
  pressure_detected: 0.75,
  risky_commitment: 0.75,
  scope_creep: 0.75,
  tone_warning: 0.85,
  client_disengagement: 0.8,
  missing_clarity: 0.8,
  undiscussed_agenda: 0.85,
} as const;
