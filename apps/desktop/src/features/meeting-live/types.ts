/** Live meeting panel shared types (placeholder until WS payloads wire in). */

export type SpeakerSide = "team_self" | "team" | "external" | "unknown";

export interface LiveTopic {
  id: string;
  label: string;
  startedAt: number;
}

/** Raw Deepgram partial line (before meeting-mode enrichment). */
export interface LiveSttPartial {
  sessionId: string;
  transcript: string;
  /** 0 = host mic, 1 = system / loopback */
  channel: number;
  /** Seconds from Deepgram (stream-relative). */
  start: number;
  ts: number;
}

/** STT final shown until processed utterance replaces it. */
export interface LivePendingUtterance {
  key: string;
  text: string;
  channel: number;
  startSec: number;
  durationSec: number;
  ts: number;
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
  isHost: boolean;
  isConnected: boolean;
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
