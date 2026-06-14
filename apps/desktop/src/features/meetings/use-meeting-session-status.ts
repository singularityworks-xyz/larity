import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface SessionStatus {
  sessionId: string;
  meetingId: string;
  status: string;
  startedAt: number;
  duration: number;
  utteranceCount: number;
}

export function useMeetingSessionStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["meeting-session", sessionId, "status"],
    queryFn: (): Promise<SessionStatus> => {
      return api.get<SessionStatus>(`/meeting-session/${sessionId}/status`);
    },
    enabled: !!sessionId,
  });
}
