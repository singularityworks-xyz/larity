import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface Meeting {
  id: string;
  clientId: string;
  title: string;
  description: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  scheduledAt: string | null;
  createdAt: string;
  participants?: Array<{
    id: string;
    role: string;
    externalName?: string | null;
    externalEmail?: string | null;
    user?: { id: string; name: string | null; email: string } | null;
  }>;
}

export function useMeetings(filters?: { clientId?: string }) {
  return useQuery({
    queryKey: ["meetings", filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters?.clientId) {
        params.append("clientId", filters.clientId);
      }
      return api.get<Meeting[]>(`/meetings?${params.toString()}`);
    },
  });
}
