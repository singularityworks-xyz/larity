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
  amount?: number;
  currency?: string;
  deadline?: string;
  quantity?: number;
  scope?: string[];
}

export interface Commitment {
  contradicts?: string;
  embedding: number[];
  extractedData?: CommitmentExtractedData;
  id: string;
  normalizedStatement: string;
  relatedCommitments: string[];
  speaker: SpeakerIdentity;
  statement: string;
  status: CommitmentStatus;
  supersedes?: string;
  timestamp: number;
  topicId: string;
  type: CommitmentType;
  utteranceId: string;
}

export interface CommitmentInsertInput {
  contradicts?: string;
  embedding: number[];
  extractedData?: CommitmentExtractedData;
  id?: string;
  normalizedStatement?: string;
  relatedCommitments?: string[];
  speaker: SpeakerIdentity;
  statement: string;
  status?: CommitmentStatus;
  supersedes?: string;
  timestamp: number;
  topicId: string;
  type: CommitmentType;
  utteranceId: string;
}

export interface CommitmentStatusUpdate {
  contradicts?: string;
  relatedCommitments?: string[];
  status: CommitmentStatus;
  supersedes?: string;
}

export interface CommitmentMatch {
  commitment: Commitment;
  similarity: number;
}

export interface CommitmentSearchOptions {
  excludeCommitmentId?: string;
  k?: number;
  minSimilarity?: number;
  speakerId?: string;
  statuses?: CommitmentStatus[];
  topicId?: string;
  type?: CommitmentType;
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
  commitment: Omit<Commitment, "embedding">;
  sessionId: string;
  timestamp: number;
  type: "insert" | "status_change";
}
