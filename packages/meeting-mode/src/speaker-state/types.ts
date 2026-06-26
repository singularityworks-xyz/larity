import type { AlertSeverity } from "../alerts/types";
import type { TopicCompleteness } from "../topic/types";
import type { SpeakerIdentity } from "../utterance/types";

export interface ToneEntry {
  timestamp: number;
  tone: string;
  utteranceId: string;
  wordCount: number;
}

export type ToneTrajectory = "stable" | "escalating" | "de-escalating";

export type EngagementLevel = "active" | "passive" | "disengaged";

export interface SpeakerState {
  avgResponseLength: number;
  engagementLevel: EngagementLevel;
  lastSpoke: number;
  responseFrequency: number;
  sessionStart: number;
  speaker: SpeakerIdentity;
  speakerId: string;
  toneHistory: ToneEntry[];
  toneTrajectory: ToneTrajectory;
  totalWords: number;
  utteranceCount: number;
}

export type SpeakerStateAlertCategory =
  | "client_disengagement"
  | "tone_warning"
  | "missing_clarity"
  | "undiscussed_agenda";

export interface SpeakerStateAlert {
  category: SpeakerStateAlertCategory;
  confidence: number;
  message: string;
  severity: AlertSeverity;
  speakerId: string;
  suggestion: string;
  surfaceReason: string;
  topicId?: string;
}

export interface SpeakerStateSummary {
  avgResponseLength: number;
  engagementLevel: EngagementLevel;
  name: string;
  recentTone: string;
  responseFrequency: number;
  speakerId: string;
  toneTrajectory: ToneTrajectory;
  type: "TEAM" | "EXTERNAL";
}

export interface SpeakerStateTrackerConfig {
  agendaMatchThreshold: number;
  clarityRequiredFields: string[];
  disengagementConsecutiveShort: number;
  disengagementFrequencyDropRatio: number;
  disengagementMinResponses: number;
  disengagementShortResponseWords: number;
  toneShiftThreshold: number;
  toneShiftWindowMs: number;
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
  currentTopicId: string | undefined;
  isTopicShift: boolean;
  prevTopicCompleteness: TopicCompleteness | undefined;
  prevTopicId: string | undefined;
  prevTopicUtteranceCount: number;
}

export interface AgendaCheckInput {
  agendaItems: string[];
  discussedTopicLabels: string[];
}
