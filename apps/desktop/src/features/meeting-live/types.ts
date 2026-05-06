/** Live meeting panel shared types (placeholder until WS payloads wire in). */

export type SpeakerSide = "team_self" | "team" | "external" | "unknown";

export interface LiveTopic {
  id: string;
  label: string;
  startedAt: number;
}

export interface LiveUtterance {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: SpeakerSide;
  /** Optional identification confidence for chip dot coloring */
  confidence?: number;
  text: string;
  timestamp: number;
  isCommitment?: boolean;
  hasAlert?: boolean;
  hasMemory?: boolean;
}

export interface LiveParticipant {
  id: string;
  name: string;
  type: "TEAM" | "EXTERNAL";
  confidence: number;
  isSelf: boolean;
}

export type CommitmentStatus =
  | "TENTATIVE"
  | "CONFIRMED"
  | "CONTRADICTED"
  | "SUPERSEDED";

export interface LiveCommitment {
  id: string;
  text: string;
  speakerId: string;
  timestamp: number;
  status: CommitmentStatus;
  sourceUtteranceId: string;
}
