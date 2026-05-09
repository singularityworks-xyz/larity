import type {
  CommitmentStatus,
  LiveCommitment,
  LiveParticipant,
  LiveTopic,
  LiveUtterance,
  SpeakerSide,
} from "./types";

interface BackendSpeaker {
  speakerId: string;
  type: "TEAM" | "EXTERNAL";
  userId?: string;
  name: string;
  diarizationIndices: number[];
  isCurrentUser: boolean;
  confidence: number;
}

interface BackendUtterance {
  utteranceId: string;
  sessionId: string;
  speaker: BackendSpeaker;
  text: string;
  timestamp: number;
  confidenceScore: number;
  startOffset: number;
  duration: number;
  wordCount: number;
  mergedCount: number;
  topicId?: string;
  embedding?: number[];
}

interface BackendTopicState {
  topicId: string;
  label: string;
  summary: string;
  centroid: number[];
  utteranceCount: number;
  lastUpdated: number;
  constraintsMentioned?: unknown[];
  commitmentsMentioned?: unknown[];
  riskFlags?: unknown[];
  completeness?: Record<string, unknown>;
}

interface BackendCommitment {
  id: string;
  statement: string;
  normalizedStatement?: string;
  speaker: BackendSpeaker;
  topicId: string;
  type: string;
  status: "tentative" | "confirmed" | "contradicted" | "superseded";
  timestamp: number;
  utteranceId: string;
  relatedCommitments?: string[];
  contradicts?: string;
  supersedes?: string;
  extractedData?: Record<string, unknown>;
}

interface BackendCommitmentLedgerEvent {
  type: "insert" | "status_change";
  sessionId: string;
  timestamp: number;
  commitment: BackendCommitment;
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
  _isCurrentUser: boolean
): string {
  if (type === "TEAM") {
    return "TEAM MEMBER";
  }
  if (type === "EXTERNAL") {
    return "EXTERNAL";
  }
  return "UNKNOWN";
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
  speaker: BackendSpeaker
): LiveParticipant {
  return {
    id: speaker.speakerId,
    name: speaker.name,
    type: speaker.type,
    confidence: speaker.confidence,
    isSelf: speaker.isCurrentUser,
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
