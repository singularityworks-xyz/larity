import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { MeetingInsights } from "./types";

export function useMeetingInsights(meetingId: string) {
  return useQuery({
    queryKey: ["meeting-insights", meetingId],
    queryFn: () => api.get<MeetingInsights>(`/meetings/${meetingId}/insights`),
    staleTime: 5 * 60 * 1000, // 5 minutes — stable unless reprocessed
    enabled: Boolean(meetingId),
  });
}
