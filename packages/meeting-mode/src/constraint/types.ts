import type { SpeakerIdentity } from "../utterance/types";

export const constraintTypes = [
  "date",
  "capacity",
  "policy",
  "dependency",
  "legal",
] as const;

export type ConstraintType = (typeof constraintTypes)[number];

export const constraintSources = ["preloaded", "meeting"] as const;

export type ConstraintSource = (typeof constraintSources)[number];

export interface Constraint {
  confidence: number;
  id: string;
  source: ConstraintSource;
  speaker?: SpeakerIdentity;
  topicIds: string[];
  type: ConstraintType;
  utteranceId?: string;
  value: string;
}

export interface ConstraintInsertInput {
  confidence: number;
  id?: string;
  source: ConstraintSource;
  speaker?: SpeakerIdentity;
  topicIds?: string[];
  type: ConstraintType;
  utteranceId?: string;
  value: string;
}

export interface ConstraintHydrationResult {
  loaded: number;
  skipped: number;
}

export interface ConstraintLedgerEvent {
  constraint: Constraint;
  sessionId: string;
  timestamp: number;
  type: "insert";
}

export interface PreloadedDecision {
  content: string;
  createdAt: number;
  id: string;
  tags: string[];
  title: string;
}

export interface PreloadedPolicyGuardrail {
  clientId: string | null;
  description: string;
  id: string;
  keywords: string[];
  name: string;
  pattern: string | null;
  ruleType: string;
  severity: string;
}

export interface PreloadedPoint {
  content: string;
  createdAt: number;
  id: string;
}

export interface PreloadedContextPayload {
  activePolicyGuardrails: PreloadedPolicyGuardrail[];
  calendarAgendaItems: string[];
  clientId: string;
  clientNameList: string[];
  keywordBlocklists: string[];
  knownConstraints: PreloadedPoint[];
  loadedAt: number;
  meetingId: string;
  openDecisions: PreloadedDecision[];
  orgId: string;
  priorCommitments: PreloadedPoint[];
  sessionId: string;
  version: 1;
}
