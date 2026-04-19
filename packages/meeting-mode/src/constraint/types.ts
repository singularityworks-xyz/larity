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
  id: string;
  type: ConstraintType;
  value: string;
  source: ConstraintSource;
  utteranceId?: string;
  speaker?: SpeakerIdentity;
  confidence: number;
  topicIds: string[];
}

export interface ConstraintInsertInput {
  id?: string;
  type: ConstraintType;
  value: string;
  source: ConstraintSource;
  utteranceId?: string;
  speaker?: SpeakerIdentity;
  confidence: number;
  topicIds?: string[];
}

export interface ConstraintHydrationResult {
  loaded: number;
  skipped: number;
}

export interface ConstraintLedgerEvent {
  type: "insert";
  sessionId: string;
  timestamp: number;
  constraint: Constraint;
}

export interface PreloadedDecision {
  id: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
}

export interface PreloadedPolicyGuardrail {
  id: string;
  name: string;
  description: string;
  ruleType: string;
  severity: string;
  keywords: string[];
  pattern: string | null;
  clientId: string | null;
}

export interface PreloadedPoint {
  id: string;
  content: string;
  createdAt: number;
}

export interface PreloadedContextPayload {
  version: 1;
  sessionId: string;
  meetingId: string;
  clientId: string;
  orgId: string;
  loadedAt: number;
  openDecisions: PreloadedDecision[];
  knownConstraints: PreloadedPoint[];
  activePolicyGuardrails: PreloadedPolicyGuardrail[];
  priorCommitments: PreloadedPoint[];
  clientNameList: string[];
  keywordBlocklists: string[];
  calendarAgendaItems: string[];
}
