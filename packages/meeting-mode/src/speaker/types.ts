import type { SpeakerIdentity } from "../utterance/types";

export interface VadSignal {
  type: "vad_speaking" | "vad_silence";
  userId: string;
  sessionId: string;
  clientSendTs: number;
  serverReceiveTs: number;
}

export interface VadSpeakerState {
  isSpeaking: boolean;
  startTs: number;
}

export type VadState = Map<string, VadSpeakerState>;

export interface SpeakerMapping {
  diarizationIndex: number;
  speaker: SpeakerIdentity;
  confirmedAt: number;
  confidence: number;
  lastUtteranceTs: number;
}

export interface CorrelationResult {
  identified: boolean;
  speaker: SpeakerIdentity;
  confidence: number;
  wasRetroactive: boolean;
}

export interface PendingUtterance {
  utteranceId: string;
  diarizationIndex: number;
  timestamp: number;
  text: string;
}

export interface SpeakerIdentifierConfig {
  correlationWindowMs: number;
  lateCorrelationWindowMs: number;
  minConfirmationSignals: number;
}

export const DEFAULT_SPEAKER_CONFIG: SpeakerIdentifierConfig = {
  correlationWindowMs: 250,
  lateCorrelationWindowMs: 2000,
  minConfirmationSignals: 1,
};
