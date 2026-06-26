import type { SpeakerIdentity } from "../utterance/types";

export type AlertCategory =
  | "self_contradiction"
  | "team_inconsistency"
  | "risky_commitment"
  | "scope_creep"
  | "client_backtrack"
  | "missing_clarity"
  | "information_risk"
  | "tone_warning"
  | "pressure_detected"
  | "policy_violation"
  | "client_disengagement"
  | "undiscussed_agenda";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type AlertRouting = "shared" | "personal" | "both";

export type AlertStatus = "pending" | "shown" | "dismissed" | "expired";

export interface Alert {
  category: AlertCategory;
  confidence: number;
  expiresAt?: number;
  id: string;
  message: string;
  reasoning?: string;

  routing: AlertRouting;
  severity: AlertSeverity;
  shownAt?: number;
  speaker: SpeakerIdentity;

  status: AlertStatus;
  suggestion?: string;
  /** Brief user-visible “why flagged” line from Tier 4 when surfaced */
  surfaceReason?: string;
  targetUserId?: string;
  timestamp: number;

  title: string;
  topicId: string;

  triggerTier: 1 | 2 | 3 | 4;
  triggerUtteranceId: string;
}

export const ALERT_PRIORITY: Record<AlertCategory, number> = {
  policy_violation: 1,
  information_risk: 2,
  self_contradiction: 3,
  team_inconsistency: 4,
  client_backtrack: 5,
  pressure_detected: 6,
  risky_commitment: 7,
  scope_creep: 8,
  tone_warning: 9,
  client_disengagement: 10,
  missing_clarity: 11,
  undiscussed_agenda: 12,
} as const;

export const ALERT_UX_RULES = {
  maxVisibleAlerts: 2,
  alertPosition: "top-right overlay",
  alertWidth: "320px max",

  fadeInDuration: 200,
  displayDuration: {
    low: 10_000,
    medium: 15_000,
    high: 20_000,
    critical: 30_000,
  },
  fadeOutDuration: 300,

  dismissOnClick: true,
  dismissOnSwipe: true,
  hoverPausesFade: true,

  newAlertPosition: "top",
  queueOverflowBehavior: "drop_lowest_priority",

  soundEnabled: false,
  hapticFeedback: {
    critical: true,
    high: false,
    medium: false,
    low: false,
  },

  debounceWindow: 5000,
  recentlyShownWindow: 60_000,
} as const;

export function createAlert(
  overrides: Partial<Alert> &
    Pick<
      Alert,
      | "category"
      | "severity"
      | "speaker"
      | "triggerUtteranceId"
      | "title"
      | "message"
      | "routing"
    >
): Alert {
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    topicId: "",
    timestamp: Date.now(),
    status: "pending",
    confidence: 0,
    triggerTier: 2,
    ...overrides,
  };
}

export function getAlertExpiryMs(severity: AlertSeverity): number {
  return ALERT_UX_RULES.displayDuration[severity];
}
