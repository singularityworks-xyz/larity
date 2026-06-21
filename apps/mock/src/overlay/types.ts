export type AlertSeverity = "critical" | "warning" | "info";

export interface OverlayAlert {
  evidence?: {
    utterance: string;
    reasoning: string;
  };
  id: string;
  isShared: boolean;
  severity: AlertSeverity;
  summary: string;
}

export interface OverlaySpeaker {
  name: string;
  type: "TEAM" | "EXTERNAL";
}

export interface OverlayTeammate {
  id: string;
  initials: string;
  name: string;
}

export interface OverlaySearchParams {
  clientName: string;
  meetingTitle: string;
  role: string;
  sessionId: string;
  startedAt: string;
  userId: string;
  wsBaseUrl: string;
}
