import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface SessionStatus {
  duration: number;
  meetingId: string;
  sessionId: string;
  startedAt: number;
  status: string;
  utteranceCount: number;
}

export function useMeetingSessionStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["meeting-session", sessionId, "status"],
    queryFn: (): Promise<SessionStatus> =>
      api.get<SessionStatus>(`/meeting-session/${sessionId}/status`),
    enabled: !!sessionId,
  });
}
