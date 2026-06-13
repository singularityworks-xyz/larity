export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
}

export interface StartSessionResponse {
  sessionId: string;
  meetingId: string;
  status: "initializing" | "active" | "paused" | "ending";
  websocketUrl: string;
  createdAt: number;
  allowNameCustomization: boolean;
}

export interface ActiveSession {
  sessionId: string;
  meetingId: string;
  title: string;
  clientId: string;
  clientName: string;
  hostUserId: string | null;
  hostName: string | null;
  startedAt: number | null;
  participantCount: number;
  allowNameCustomization: boolean;
}

export interface JoinSessionResponse {
  success: boolean;
  sessionId: string;
  meetingId: string;
  role: "participant";
  websocketUrl: string;
  joinedAt: number;
  allowNameCustomization: boolean;
}
export interface AgendaItem {
  id: string;
  text: string;
  durationMinutes?: number;
}
