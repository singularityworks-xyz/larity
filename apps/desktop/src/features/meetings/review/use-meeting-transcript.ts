import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import type { MeetingTranscript } from "./types";

export function useMeetingTranscript(meetingId: string) {
  return useQuery({
    queryKey: ["meeting-transcript", meetingId],
    queryFn: () =>
      api.get<MeetingTranscript>(`/meetings/${meetingId}/transcript`),
    staleTime: 10 * 60 * 1000,
    enabled: Boolean(meetingId),
    retry: (failureCount, error) => {
      if (error && typeof error === "object" && "status" in error) {
        const err = error as { status: number };
        if (err.status === 404) {
          return false;
        }
      }
      return failureCount < 2;
    },
  });
}
