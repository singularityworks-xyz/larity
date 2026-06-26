import type {
  CommitmentStatus,
  LiveCommitment,
  LiveParticipant,
  LiveTopic,
  LiveUtterance,
  SpeakerSide,
} from "./types";

interface BackendSpeaker {
  confidence: number;
  diarizationIndices: number[];
  isCurrentUser: boolean;
  name: string;
  speakerId: string;
  type: "TEAM" | "EXTERNAL";
  userId?: string;
}

interface BackendUtterance {
  confidenceScore: number;
  duration: number;
  embedding?: number[];
  mergedCount: number;
  sessionId: string;
  speaker: BackendSpeaker;
  startOffset: number;
  text: string;
  timestamp: number;
  topicId?: string;
  utteranceId: string;
  wordCount: number;
}

interface BackendTopicState {
  centroid: number[];
  commitmentsMentioned?: unknown[];
  completeness?: Record<string, unknown>;
  constraintsMentioned?: unknown[];
  label: string;
  lastUpdated: number;
  riskFlags?: unknown[];
  summary: string;
  topicId: string;
  utteranceCount: number;
}

interface BackendCommitment {
  contradicts?: string;
  extractedData?: Record<string, unknown>;
  id: string;
  normalizedStatement?: string;
  relatedCommitments?: string[];
  speaker: BackendSpeaker;
  statement: string;
  status: "tentative" | "confirmed" | "contradicted" | "superseded";
  supersedes?: string;
  timestamp: number;
  topicId: string;
  type: string;
  utteranceId: string;
}

interface BackendCommitmentLedgerEvent {
  commitment: BackendCommitment;
  sessionId: string;
  timestamp: number;
  type: "insert" | "status_change";
}

const BACKEND_STATUS_TO_FRONTEND: Record<string, CommitmentStatus> = {
  tentative: "TENTATIVE",
  confirmed: "CONFIRMED",
  contradicted: "CONTRADICTED",
  superseded: "SUPERSEDED",
};

function mapSpeakerTypeToSide(
  type: "TEAM" | "EXTERNAL",
  isCurrentUser: boolean
): SpeakerSide {
  if (isCurrentUser && type === "TEAM") {
    return "team_self";
  }
  if (type === "TEAM") {
    return "team";
  }
  if (type === "EXTERNAL") {
    return "external";
  }
  return "unknown";
}

function mapSpeakerTypeToTranscriptLabel(
  type: "TEAM" | "EXTERNAL",
  isCurrentUser: boolean
): string {
  if (isCurrentUser && type === "TEAM") {
    return "YOU";
  }
  if (type === "TEAM") {
    return "TEAM MEMBER";
  }
  return "EXTERNAL";
}

export function mapBackendUtteranceToLive(
  utterance: BackendUtterance
): LiveUtterance {
  return {
    id: utterance.utteranceId,
    speakerId: utterance.speaker.speakerId,
    speakerName: mapSpeakerTypeToTranscriptLabel(
      utterance.speaker.type,
      utterance.speaker.isCurrentUser
    ),
    speakerType: mapSpeakerTypeToSide(
      utterance.speaker.type,
      utterance.speaker.isCurrentUser
    ),
    confidence: utterance.speaker.confidence,
    text: utterance.text,
    timestamp: utterance.timestamp,
    isCommitment: false,
    hasAlert: false,
    hasMemory: false,
  };
}

export function mapBackendTopicToLive(topic: BackendTopicState): LiveTopic {
  return {
    id: topic.topicId,
    label: topic.label,
    startedAt: topic.lastUpdated,
  };
}

export function mapBackendCommitmentToLive(
  commitment: BackendCommitment
): LiveCommitment {
  return {
    id: commitment.id,
    text: commitment.statement,
    speakerId: commitment.speaker.speakerId,
    timestamp: commitment.timestamp,
    status: BACKEND_STATUS_TO_FRONTEND[commitment.status] ?? "TENTATIVE",
    sourceUtteranceId: commitment.utteranceId,
  };
}

export function mapSpeakerToParticipant(
  speaker: BackendSpeaker,
  hostUserId?: string
): LiveParticipant {
  return {
    id: speaker.speakerId,
    name: speaker.name,
    type: speaker.type,
    confidence: speaker.confidence,
    isSelf: speaker.isCurrentUser,
    isHost: speaker.userId != null && speaker.userId === hostUserId,
    isConnected: true,
  };
}

export function isCommitmentLedgerEvent(
  data: unknown
): data is BackendCommitmentLedgerEvent {
  if (data === null || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  const eventType = record.type;
  return (
    typeof eventType === "string" &&
    (eventType === "insert" || eventType === "status_change") &&
    typeof record.commitment === "object" &&
    record.commitment !== null
  );
}

export function isBackendUtterance(data: unknown): data is BackendUtterance {
  if (data === null || typeof data !== "object") {
    return false;
  }
  return typeof (data as Record<string, unknown>).utteranceId === "string";
}

export function isBackendTopicState(data: unknown): data is BackendTopicState {
  if (data === null || typeof data !== "object") {
    return false;
  }
  return typeof (data as Record<string, unknown>).topicId === "string";
}
