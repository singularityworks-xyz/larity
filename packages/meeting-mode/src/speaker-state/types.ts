import type { AlertSeverity } from "../alerts/types";
import type { TopicCompleteness } from "../topic/types";
import type { SpeakerIdentity } from "../utterance/types";

export interface ToneEntry {
  tone: string;
  timestamp: number;
  utteranceId: string;
  wordCount: number;
}

export type ToneTrajectory = "stable" | "escalating" | "de-escalating";

export type EngagementLevel = "active" | "passive" | "disengaged";

export interface SpeakerState {
  speakerId: string;
  speaker: SpeakerIdentity;
  toneHistory: ToneEntry[];
  avgResponseLength: number;
  responseFrequency: number;
  lastSpoke: number;
  toneTrajectory: ToneTrajectory;
  engagementLevel: EngagementLevel;
  utteranceCount: number;
  totalWords: number;
  sessionStart: number;
}

export type SpeakerStateAlertCategory =
  | "client_disengagement"
  | "tone_warning"
  | "missing_clarity"
  | "undiscussed_agenda";

export interface SpeakerStateAlert {
  category: SpeakerStateAlertCategory;
  severity: AlertSeverity;
  message: string;
  surfaceReason: string;
  suggestion: string;
  speakerId: string;
  topicId?: string;
  confidence: number;
}

export interface SpeakerStateSummary {
  speakerId: string;
  name: string;
  type: "TEAM" | "EXTERNAL";
  toneTrajectory: ToneTrajectory;
  engagementLevel: EngagementLevel;
  avgResponseLength: number;
  responseFrequency: number;
  recentTone: string;
}

export interface SpeakerStateTrackerConfig {
  toneShiftWindowMs: number;
  toneShiftThreshold: number;
  disengagementMinResponses: number;
  disengagementShortResponseWords: number;
  disengagementConsecutiveShort: number;
  disengagementFrequencyDropRatio: number;
  clarityRequiredFields: string[];
  agendaMatchThreshold: number;
}

export const DEFAULT_SPEAKER_STATE_CONFIG: SpeakerStateTrackerConfig = {
  toneShiftWindowMs: 15 * 60 * 1000,
  toneShiftThreshold: 2,
  disengagementMinResponses: 5,
  disengagementShortResponseWords: 3,
  disengagementConsecutiveShort: 4,
  disengagementFrequencyDropRatio: 0.5,
  clarityRequiredFields: ["owner", "deadline", "actions"],
  agendaMatchThreshold: 0.6,
};

export const TONE_NUMERIC_SCALE: Record<string, number> = {
  neutral: 0,
  confident: 0,
  hesitant: 1,
  defensive: 2,
  aggressive: 3,
};

export interface ClarityCheckInput {
  prevTopicId: string | undefined;
  prevTopicCompleteness: TopicCompleteness | undefined;
  prevTopicUtteranceCount: number;
  currentTopicId: string | undefined;
  isTopicShift: boolean;
}

export interface AgendaCheckInput {
  discussedTopicLabels: string[];
  agendaItems: string[];
}
