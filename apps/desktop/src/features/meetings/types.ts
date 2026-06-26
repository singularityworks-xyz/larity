export interface ClientSummary {
  id: string;
  name: string;
  slug: string;
}

export interface StartSessionResponse {
  allowNameCustomization: boolean;
  createdAt: number;
  meetingId: string;
  sessionId: string;
  status: "initializing" | "active" | "paused" | "ending";
  websocketUrl: string;
}

export interface ActiveSession {
  allowNameCustomization: boolean;
  clientId: string;
  clientName: string;
  hostName: string | null;
  hostUserId: string | null;
  meetingId: string;
  participantCount: number;
  sessionId: string;
  startedAt: number | null;
  title: string;
}

export interface JoinSessionResponse {
  allowNameCustomization: boolean;
  joinedAt: number;
  meetingId: string;
  role: "host" | "participant";
  sessionId: string;
  success: boolean;
  websocketUrl: string;
}
export interface AgendaItem {
  durationMinutes?: number;
  id: string;
  text: string;
}
