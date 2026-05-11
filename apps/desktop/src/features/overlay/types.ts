export type AlertSeverity = "critical" | "warning" | "info";

export interface OverlayAlert {
  id: string;
  severity: AlertSeverity;
  summary: string;
  isShared: boolean;
  evidence?: {
    utterance: string;
    reasoning: string;
  };
}

export interface OverlaySpeaker {
  name: string;
  type: "TEAM" | "EXTERNAL";
}

export interface OverlayTeammate {
  id: string;
  name: string;
  initials: string;
}

export interface OverlaySearchParams {
  sessionId: string;
  role: string;
  clientName: string;
  meetingTitle: string;
  startedAt: string;
  wsBaseUrl: string;
  userId: string;
}
