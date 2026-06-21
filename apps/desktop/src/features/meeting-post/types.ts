/**
 * Types for the post-meeting insights view.
 * These mirror the Prisma models returned by the control app endpoints.
 */
import type { MeetingAnalysis } from "@larity/db/meeting-analysis.types";

export type DecisionStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export interface Decision {
  clientId: string;
  content: string;
  createdAt: string;
  decisionRef: string;
  evidence: string | null;
  id: string;
  meetingId: string | null;
  rationale: string | null;
  status: DecisionStatus;
  tags: string[];
  title: string;
  version: number;
}

export type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Task {
  assigneeId: string | null;
  clientId: string;
  completedAt: string | null;
  createdAt: string;
  decisionId: string | null;
  description: string | null;
  dueAt: string | null;
  id: string;
  meetingId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
}

export type OpenQuestionStatus = "OPEN" | "RESOLVED" | "DEFERRED";

export interface OpenQuestion {
  assigneeId: string | null;
  clientId: string;
  context: string | null;
  createdAt: string;
  dueAt: string | null;
  id: string;
  meetingId: string | null;
  question: string;
  resolvedAt: string | null;
  resolvedByDecisionId: string | null;
  status: OpenQuestionStatus;
}

export type ImportantPointCategory =
  | "COMMITMENT"
  | "CONSTRAINT"
  | "INSIGHT"
  | "WARNING"
  | "RISK"
  | "OPPORTUNITY";

export interface ImportantPoint {
  category: ImportantPointCategory;
  clientId: string;
  content: string;
  createdAt: string;
  id: string;
  meetingId: string | null;
  speakerId: string | null;
  transcriptEvidence: string | null;
}

export interface MeetingInsights {
  analysis: MeetingAnalysis | null;
  decisions: Decision[];
  importantPoints: ImportantPoint[];
  openQuestions: OpenQuestion[];
  tasks: Task[];
}

export type JobStatus = "queued" | "processing" | "done" | "failed";

export interface ProcessingSteps {
  summary: JobStatus | null;
  transcribe: JobStatus | null;
}

export interface ProcessingStatus {
  errorReason?: string | null;
  sessionId: string | null;
  steps: ProcessingSteps;
}

export interface TranscriptUtterance {
  channel: number;
  duration: number;
  id?: string;
  speaker: string;
  text: string;
  timestamp: number;
  type?: "TEAM" | "EXTERNAL";
}

export interface MeetingTranscript {
  content: string; // JSON string of TranscriptUtterance[]
  createdAt: string;
  duration: number | null;
  format: "RAW" | "NORMALIZED" | "STRUCTURED";
  id: string;
  meetingId: string;
  wordCount: number | null;
}
