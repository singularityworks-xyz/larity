/**
 * Types for the post-meeting insights view.
 * These mirror the Prisma models returned by the control app endpoints.
 */
import type { MeetingAnalysis } from "@larity/infra/prisma/meeting-analysis.types";

export type DecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface Decision {
  id: string;
  decisionRef: string;
  version: number;
  clientId: string;
  meetingId: string | null;
  title: string;
  content: string;
  rationale: string | null;
  evidence: string | null;
  status: DecisionStatus;
  tags: string[];
  createdAt: string;
}

export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Task {
  id: string;
  clientId: string;
  meetingId: string | null;
  decisionId: string | null;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export type OpenQuestionStatus = "OPEN" | "RESOLVED" | "DEFERRED";

export interface OpenQuestion {
  id: string;
  clientId: string;
  meetingId: string | null;
  assigneeId: string | null;
  resolvedByDecisionId: string | null;
  question: string;
  context: string | null;
  status: OpenQuestionStatus;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export type ImportantPointCategory =
  | "COMMITMENT"
  | "CONSTRAINT"
  | "INSIGHT"
  | "WARNING"
  | "RISK"
  | "OPPORTUNITY";

export interface ImportantPoint {
  id: string;
  clientId: string;
  meetingId: string | null;
  speakerId: string | null;
  content: string;
  category: ImportantPointCategory;
  transcriptEvidence: string | null;
  createdAt: string;
}

export interface MeetingInsights {
  analysis: MeetingAnalysis | null;
  decisions: Decision[];
  tasks: Task[];
  openQuestions: OpenQuestion[];
  importantPoints: ImportantPoint[];
}

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface ProcessingSteps {
  transcribe: JobStatus | null;
  summary: JobStatus | null;
}

export interface ProcessingStatus {
  sessionId: string | null;
  steps: ProcessingSteps;
  errorReason?: string | null;
}

export interface TranscriptUtterance {
  id?: string;
  speaker: string;
  text: string;
  timestamp: number;
  duration: number;
  channel: number;
  type?: "TEAM" | "EXTERNAL";
}

export interface MeetingTranscript {
  id: string;
  meetingId: string;
  content: string; // JSON string of TranscriptUtterance[]
  format: "RAW" | "NORMALIZED" | "STRUCTURED";
  duration: number | null;
  wordCount: number | null;
  createdAt: string;
}
