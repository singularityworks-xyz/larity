import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Meeting } from "./use-meetings";

export function useMeeting(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["meetings", meetingId],
    queryFn: (): Promise<Meeting> => api.get<Meeting>(`/meetings/${meetingId}`),
    enabled: !!meetingId,
  });
}
