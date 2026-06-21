export type KeyMomentCategory =
  | "DECISION"
  | "TASK"
  | "RISK"
  | "COMMITMENT"
  | "WARNING"
  | "INSIGHT"
  | "OPPORTUNITY";

export interface MeetingKeyMoment {
  category: KeyMomentCategory;
  description: string; // "Client challenged team size"
  timestamp: number; // seconds from start
}
export interface MeetingSpeakerStats {
  /** Questions from this meeting that were assigned to this speaker. */
  assignedQuestionCount: number;
  commitmentCount: number;
  name: string;
  participantId?: string; // resolved userId if matched
  role: "TEAM_MEMBER" | "EXTERNAL" | "UNKNOWN";
  speakerLabel: string; // raw transcript label e.g. "Aman"
  talkTimePercent: number;
  utteranceCount: number;
}

export interface MeetingAnalysis {
  clientSentiment:
    | "ENTHUSIASTIC"
    | "INTERESTED"
    | "NEUTRAL"
    | "SKEPTICAL"
    | "HOSTILE";
  durationSeconds: number;
  generatedAt: string; // ISO timestamp
  keyMoments: MeetingKeyMoment[];
  outcome: string;
  participantCount: number;
  prose: string;
  purpose: string;
  schemaVersion: 1;
  speakers: MeetingSpeakerStats[];
  tone: "POSITIVE" | "NEUTRAL" | "TENSE" | "MIXED";
}

export function isMeetingAnalysis(value: unknown): value is MeetingAnalysis {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === 1 &&
    typeof v.purpose === "string" &&
    typeof v.outcome === "string" &&
    typeof v.prose === "string" &&
    typeof v.tone === "string" &&
    typeof v.clientSentiment === "string" &&
    Array.isArray(v.keyMoments) &&
    Array.isArray(v.speakers)
  );
}
