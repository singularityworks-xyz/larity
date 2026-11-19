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
  | "undiscussed_agenda"
  | "unidentified_speaker";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type AlertRouting = "shared" | "personal" | "both";

export interface MeetingAlert {
  category: AlertCategory;
  confidence: number;
  evidence?: {
    utterance: string;
    reasoning: string;
  };
  id: string;
  isShared: boolean;
  message: string;
  routing: AlertRouting;
  severity: AlertSeverity;
  speakerName?: string;
  speakerType?: "TEAM" | "EXTERNAL";
  suggestion?: string;
  surfaceReason?: string;
  timestamp: number;
  title: string;
  triggerTier: 1 | 2 | 3 | 4;
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
  unidentified_speaker: 12,
  undiscussed_agenda: 13,
} as const;

export const ALERT_EXPIRY_MS: Record<AlertSeverity, number> = {
  low: 10_000,
  medium: 15_000,
  high: 20_000,
  critical: 30_000,
} as const;

export const MAX_VISIBLE_ALERTS = 2;

export interface AlertCategoryMeta {
  bgWash?: string;
  borderClass: string;
  iconKey: string;
  title: string;
}

export const ALERT_CATEGORY_META: Record<AlertCategory, AlertCategoryMeta> = {
  self_contradiction: {
    title: "Contradiction",
    borderClass: "border-l-warning-fg",
    iconKey: "git-branch",
  },
  team_inconsistency: {
    title: "Team inconsistency",
    borderClass: "border-l-[#E8912D]",
    iconKey: "users",
  },
  risky_commitment: {
    title: "Risky commitment",
    borderClass: "border-l-[#E8912D]",
    iconKey: "alert-triangle",
  },
  scope_creep: {
    title: "Scope creep",
    borderClass: "border-l-info-fg",
    iconKey: "expand",
  },
  client_backtrack: {
    title: "Client backtrack",
    borderClass: "border-l-accent",
    iconKey: "undo-2",
  },
  missing_clarity: {
    title: "Needs clarity",
    borderClass: "border-l-fg-muted",
    iconKey: "help-circle",
  },
  information_risk: {
    title: "Information risk",
    borderClass: "border-l-danger-fg",
    iconKey: "lock",
  },
  tone_warning: {
    title: "Tone caution",
    borderClass: "border-l-warning-fg",
    iconKey: "mic",
  },
  pressure_detected: {
    title: "Pressure tactic",
    borderClass: "border-l-danger-fg",
    iconKey: "gauge",
  },
  policy_violation: {
    title: "Policy risk",
    borderClass: "border-l-danger-fg",
    iconKey: "shield-alert",
  },
  client_disengagement: {
    title: "Possible disengagement",
    borderClass: "border-l-fg-muted",
    iconKey: "user-x",
  },
  undiscussed_agenda: {
    title: "Undiscussed agenda",
    borderClass: "border-l-info-fg",
    iconKey: "list-checks",
  },
  unidentified_speaker: {
    title: "Identify Speaker",
    borderClass: "border-l-accent",
    iconKey: "user-circle",
  },
} as const;

export const SEVERITY_DOT_CLASS: Record<AlertSeverity, string> = {
  critical: "bg-danger-fg",
  high: "bg-danger-fg",
  medium: "bg-warning-fg",
  low: "bg-info-fg",
} as const;
