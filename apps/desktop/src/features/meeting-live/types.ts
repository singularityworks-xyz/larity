/** Live meeting panel shared types (placeholder until WS payloads wire in). */

export type SpeakerSide = "team_self" | "team" | "external" | "unknown";

export interface LiveTopic {
  id: string;
  label: string;
  startedAt: number;
}

/** Raw Deepgram partial line (before meeting-mode enrichment). */
export interface LiveSttPartial {
  /** 0 = host mic, 1 = system / loopback */
  channel: number;
  sessionId: string;
  /** Seconds from Deepgram (stream-relative). */
  start: number;
  transcript: string;
  ts: number;
}

/** STT final shown until processed utterance replaces it. */
export interface LivePendingUtterance {
  channel: number;
  durationSec: number;
  key: string;
  startSec: number;
  text: string;
  ts: number;
}

export interface LiveUtterance {
  /** Optional identification confidence for chip dot coloring */
  confidence?: number;
  hasAlert?: boolean;
  hasMemory?: boolean;
  id: string;
  isCommitment?: boolean;
  speakerId: string;
  speakerName: string;
  speakerType: SpeakerSide;
  text: string;
  timestamp: number;
}

export interface LiveParticipant {
  confidence: number;
  id: string;
  isConnected: boolean;
  isHost: boolean;
  isSelf: boolean;
  name: string;
  type: "TEAM" | "EXTERNAL";
}

export type CommitmentStatus =
  | "TENTATIVE"
  | "CONFIRMED"
  | "CONTRADICTED"
  | "SUPERSEDED";

export interface LiveCommitment {
  contradictedAtTimestamp?: number;
  id: string;
  sourceUtteranceId: string;
  speakerId: string;
  speakerName?: string;
  status: CommitmentStatus;
  text: string;
  timestamp: number;
}
