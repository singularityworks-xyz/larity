export type SpeakerSide = "team_self" | "team" | "external" | "unknown";

export interface LiveTopic {
  id: string;
  label: string;
  startedAt: number;
}

export interface LiveSttPartial {
  channel: number;
  sessionId: string;
  start: number;
  transcript: string;
  ts: number;
}

export interface LivePendingUtterance {
  channel: number;
  durationSec: number;
  key: string;
  startSec: number;
  text: string;
  ts: number;
}

export interface LiveUtterance {
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
  topicId?: string;
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
