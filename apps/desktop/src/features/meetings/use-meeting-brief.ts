import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface MeetingBrief {
  meetingId: string;
  tldr: string;
  sentiment: string;
  landmines: Array<{ id: string; text: string; category: string }>;
  commitments: {
    mine: Array<{ id: string; text: string; status: string }>;
    theirs: Array<{ id: string; text: string; status: string }>;
  };
  suggestedAgenda: string[];
}

export function useMeetingBrief(meetingId: string | undefined) {
  return useQuery({
    queryKey: ["meetings", meetingId, "brief"],
    queryFn: (): Promise<MeetingBrief> => {
      return api.get<MeetingBrief>(`/meetings/${meetingId}/brief`);
    },
    enabled: !!meetingId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    retry: 1,
  });
}
