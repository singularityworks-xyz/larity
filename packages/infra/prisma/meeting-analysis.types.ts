export type KeyMomentCategory =
  | "DECISION"
  | "TASK"
  | "RISK"
  | "COMMITMENT"
  | "WARNING"
  | "INSIGHT"
  | "OPPORTUNITY";

export interface MeetingKeyMoment {
  timestamp: number; // seconds from start
  description: string; // "Client challenged team size"
  category: KeyMomentCategory;
}
export interface MeetingSpeakerStats {
  speakerLabel: string; // raw transcript label e.g. "Aman"
  participantId?: string; // resolved userId if matched
  name: string;
  role: "TEAM_MEMBER" | "EXTERNAL" | "UNKNOWN";
  talkTimePercent: number;
  utteranceCount: number;
  commitmentCount: number;
  /** Questions from this meeting that were assigned to this speaker. */
  assignedQuestionCount: number;
}

export interface MeetingAnalysis {
  schemaVersion: 1;
  purpose: string;
  outcome: string;
  prose: string;
  tone: "POSITIVE" | "NEUTRAL" | "TENSE" | "MIXED";
  clientSentiment:
    | "ENTHUSIASTIC"
    | "INTERESTED"
    | "NEUTRAL"
    | "SKEPTICAL"
    | "HOSTILE";
  keyMoments: MeetingKeyMoment[];
  speakers: MeetingSpeakerStats[];
  durationSeconds: number;
  participantCount: number;
  generatedAt: string; // ISO timestamp
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
