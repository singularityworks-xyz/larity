import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ReprocessResult {
  jobId: string;
  sessionId: string;
}

export function useReprocess(meetingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<ReprocessResult>(`/meetings/${meetingId}/reprocess`),
    onSuccess: () => {
      // Invalidate both insights and processing status to trigger a fresh fetch
      queryClient.invalidateQueries({
        queryKey: ["meeting-insights", meetingId],
      });
      queryClient.invalidateQueries({
        queryKey: ["processing-status", meetingId],
      });
    },
  });
}
