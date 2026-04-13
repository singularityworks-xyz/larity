import type { SpeakerIdentity } from "../utterance/types";
import type { AlertCategory, AlertRouting } from "./types";

export interface RoutingInput {
  category: AlertCategory;
  speaker: SpeakerIdentity;
  viewerUserId: string;
}

const PERSONAL_CATEGORIES_OWN: ReadonlySet<AlertCategory> = new Set([
  "self_contradiction",
  "risky_commitment",
  "tone_warning",
]);

const SHARED_CATEGORIES: ReadonlySet<AlertCategory> = new Set([
  "team_inconsistency",
  "scope_creep",
  "client_backtrack",
  "missing_clarity",
  "pressure_detected",
  "client_disengagement",
  "undiscussed_agenda",
]);

const BOTH_CATEGORIES: ReadonlySet<AlertCategory> = new Set([
  "information_risk",
  "policy_violation",
]);

export function resolveAlertRouting(input: RoutingInput): AlertRouting {
  const { category, speaker, viewerUserId } = input;

  if (BOTH_CATEGORIES.has(category)) {
    return "both";
  }

  if (SHARED_CATEGORIES.has(category)) {
    return "shared";
  }

  if (PERSONAL_CATEGORIES_OWN.has(category)) {
    return speaker.userId === viewerUserId ? "personal" : "shared";
  }

  return "shared";
}

export function resolveTargetUserId(input: RoutingInput): string | undefined {
  const routing = resolveAlertRouting(input);

  if (routing === "personal" || routing === "both") {
    return input.speaker.userId;
  }

  return undefined;
}

export function resolveFullRouting(input: RoutingInput): {
  routing: AlertRouting;
  targetUserId?: string;
} {
  const routing = resolveAlertRouting(input);
  const targetUserId = resolveTargetUserId(input);
  return { routing, targetUserId };
}
