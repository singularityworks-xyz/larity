import type { SpeakerIdentity } from "../utterance/types";

export const commitmentStatuses = [
  "tentative",
  "confirmed",
  "contradicted",
  "superseded",
] as const;

export type CommitmentStatus = (typeof commitmentStatuses)[number];

export const commitmentTypes = [
  "timeline",
  "scope",
  "resource",
  "price",
  "capability",
  "limitation",
  "dependency",
  "general",
] as const;

export type CommitmentType = (typeof commitmentTypes)[number];

export interface CommitmentExtractedData {
  deadline?: string;
  quantity?: number;
  scope?: string[];
  amount?: number;
  currency?: string;
}

export interface Commitment {
  id: string;
  statement: string;
  normalizedStatement: string;
  speaker: SpeakerIdentity;
  topicId: string;
  type: CommitmentType;
  status: CommitmentStatus;
  timestamp: number;
  utteranceId: string;
  embedding: number[];
  relatedCommitments: string[];
  contradicts?: string;
  supersedes?: string;
  extractedData?: CommitmentExtractedData;
}

export interface CommitmentInsertInput {
  id?: string;
  statement: string;
  normalizedStatement?: string;
  speaker: SpeakerIdentity;
  topicId: string;
  type: CommitmentType;
  timestamp: number;
  utteranceId: string;
  embedding: number[];
  extractedData?: CommitmentExtractedData;
  relatedCommitments?: string[];
  status?: CommitmentStatus;
  contradicts?: string;
  supersedes?: string;
}

export interface CommitmentStatusUpdate {
  status: CommitmentStatus;
  relatedCommitments?: string[];
  contradicts?: string;
  supersedes?: string;
}

export interface CommitmentMatch {
  commitment: Commitment;
  similarity: number;
}

export interface CommitmentSearchOptions {
  k?: number;
  minSimilarity?: number;
  speakerId?: string;
  topicId?: string;
  type?: CommitmentType;
  statuses?: CommitmentStatus[];
  excludeCommitmentId?: string;
}

export interface CommitmentCrossSpeakerSearchOptions
  extends Omit<CommitmentSearchOptions, "speakerId"> {
  speakerId: string;
}

export interface LedgerHydrationResult {
  loaded: number;
  skipped: number;
}

export interface CommitmentLedgerEvent {
  type: "insert" | "status_change";
  sessionId: string;
  timestamp: number;
  commitment: Omit<Commitment, "embedding">;
}
