import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface MeetingBrief {
  commitments: {
    mine: Array<{ id: string; text: string; status: string }>;
    theirs: Array<{ id: string; text: string; status: string }>;
  };
  landmines: Array<{ id: string; text: string; category: string }>;
  meetingId: string;
  sentiment: string;
  suggestedAgenda: string[];
  tldr: string;
}

export function useMeetingBrief(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["meetings", meetingId, "brief"],
    queryFn: (): Promise<MeetingBrief> =>
      api.get<MeetingBrief>(`/meetings/${meetingId}/brief`),
    enabled: !!meetingId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
