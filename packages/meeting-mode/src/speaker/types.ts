import type { SpeakerIdentity } from "../utterance/types";

export interface VadSignal {
  clientSendTs: number;
  role?: "host" | "participant";
  serverReceiveTs: number;
  sessionId: string;
  type: "vad_speaking" | "vad_silence";
  userId: string;
}

export interface VadSpeakerState {
  isSpeaking: boolean;
  startTs: number;
}

export type VadState = Map<string, VadSpeakerState>;

export interface VadActivityInterval {
  endTs?: number;
  startTs: number;
  userId: string;
}

export type MappingSource =
  | "partial_provisional"
  | "final_confirmed"
  | "retroactive_vad";

export interface SpeakerMapping {
  confidence: number;
  confirmedAt: number;
  diarizationIndex: number;
  lastUtteranceTs: number;
  source?: MappingSource;
  speaker: SpeakerIdentity;
}

export interface CorrelationResult {
  confidence: number;
  identified: boolean;
  speaker: SpeakerIdentity;
  wasRetroactive: boolean;
}

export interface PendingUtterance {
  diarizationIndex: number;
  text: string;
  timestamp: number;
  utteranceId: string;
}

export interface SpeakerIdentifierConfig {
  correlationWindowMs: number;
  lateCorrelationWindowMs: number;
  maxVadIntervalsPerUser: number;
  minConfirmationSignals: number;
  provisionalTtlMs: number;
  vadTrailingCooldownMs: number;
}

export const DEFAULT_SPEAKER_CONFIG: SpeakerIdentifierConfig = {
  correlationWindowMs: 1500,
  lateCorrelationWindowMs: 2000,
  minConfirmationSignals: 1,
  provisionalTtlMs: 8000,
  maxVadIntervalsPerUser: 8,
  vadTrailingCooldownMs: 200,
};

export interface SessionStateTeamMember {
  name: string;
  role?: "host" | "participant";
  userId: string;
}

export type SessionStateSpeakerMapping = SpeakerMapping;

export interface SessionSpeakerStatePayload {
  speakerMappings: Record<string, SessionStateSpeakerMapping>;
  teamMembers: SessionStateTeamMember[];
  vadHistory: Array<{
    userId: string;
    type: "vad_speaking" | "vad_silence";
    adjustedTs: number;
    role?: "host" | "participant";
  }>;
}
