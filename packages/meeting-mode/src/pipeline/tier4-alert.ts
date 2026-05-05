import type { Alert, AlertCategory } from "../alerts/types";
import { createAlert } from "../alerts/types";
import { SILENT_COLLABORATOR_THRESHOLDS } from "../speculative/types";
import type { SpeakerIdentity } from "../utterance/types";
import type { Tier4Response } from "./types";

/**
 * @deprecated Use {@link shouldTier4RespondForCategory} or {@link SILENT_COLLABORATOR_THRESHOLDS} instead.
 * Kept for backward compatibility with code that needs a global floor.
 */
export const MIN_TIER4_SURFACING_CONFIDENCE = 0.45;

/** Human-readable titles keyed by canonical alert categories */
export const TIER4_CATEGORY_TITLE: Record<AlertCategory, string> = {
  self_contradiction: "Contradiction",
  team_inconsistency: "Team inconsistency",
  risky_commitment: "Risky commitment",
  scope_creep: "Scope creep",
  client_backtrack: "Client backtrack",
  missing_clarity: "Needs clarity",
  information_risk: "Information risk",
  tone_warning: "Tone caution",
  pressure_detected: "Pressure tactic",
  policy_violation: "Policy risk",
  client_disengagement: "Possible disengagement",
  undiscussed_agenda: "Undiscussed agenda",
};

/**
 * Ensure personal/both alerts always have targetUserId when possible.
 */
export function coerceTier4RoutingForPublication(params: {
  response: Tier4Response;
  triggerSpeaker: SpeakerIdentity;
}): Pick<Alert, "routing" | "targetUserId"> {
  const { response, triggerSpeaker } = params;
  let routing = response.routing;
  let targetUserId =
    response.targetUserId ??
    ((routing === "personal" || routing === "both") && triggerSpeaker.userId
      ? triggerSpeaker.userId
      : undefined);

  if ((routing === "personal" || routing === "both") && !targetUserId) {
    routing = "shared";
    targetUserId = undefined;
  }

  return { routing, targetUserId };
}

/**
 * Decide whether Tier 4 wishes to abstain despite schema validity.
 * Uses per-category confidence thresholds from SILENT_COLLABORATOR_THRESHOLDS.
 */
export function shouldTier4Respond(response: Tier4Response): boolean {
  if (response.alertType === "none" || !response.shouldSurface) {
    return false;
  }

  const threshold = getCategoryThreshold(response.alertType as AlertCategory);
  if (response.confidence < threshold) {
    return false;
  }

  const msg = response.message.trim();
  if (!msg) {
    return false;
  }

  const surfaceReason = response.surfaceReason?.trim() ?? "";
  if (!surfaceReason) {
    return false;
  }

  const sug =
    typeof response.suggestion === "string" ? response.suggestion.trim() : "";
  if (!sug) {
    return false;
  }

  return true;
}

/**
 * Per-category confidence floor for Tier 4 alert surfacing.
 * Falls back to MIN_TIER4_SURFACING_CONFIDENCE for unknown categories.
 */
export function getCategoryThreshold(category: AlertCategory): number {
  return (
    SILENT_COLLABORATOR_THRESHOLDS[category] ?? MIN_TIER4_SURFACING_CONFIDENCE
  );
}

export function buildAlertFromTier4Response(params: {
  response: Tier4Response;
  triggerUtteranceId: string;
  speaker: SpeakerIdentity;
  topicId: string | undefined;
}): Alert | null {
  const { response, triggerUtteranceId, speaker, topicId } = params;

  if (!shouldTier4Respond(response)) {
    return null;
  }

  if (response.alertType === "none") {
    return null;
  }

  const category = response.alertType as AlertCategory;

  const { routing, targetUserId } = coerceTier4RoutingForPublication({
    response,
    triggerSpeaker: speaker,
  });

  const title = TIER4_CATEGORY_TITLE[category];

  return createAlert({
    category,
    severity: response.severity,
    speaker,
    triggerUtteranceId,
    title,
    message: response.message,
    surfaceReason: response.surfaceReason,
    suggestion: response.suggestion,
    routing,
    targetUserId,
    confidence: response.confidence,
    triggerTier: 4,
    topicId: topicId ?? "",
    reasoning: response.reasoning,
    status: "pending",
    timestamp: Date.now(),
  });
}
