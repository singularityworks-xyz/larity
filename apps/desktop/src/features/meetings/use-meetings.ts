import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface Meeting {
  client?: {
    id: string;
    name: string;
    slug: string;
  };
  clientId: string;
  createdAt: string;
  description: string | null;
  id: string;
  participants?: Array<{
    id: string;
    role: string;
    externalName?: string | null;
    externalEmail?: string | null;
    user?: { id: string; name: string | null; email: string } | null;
  }>;
  scheduledAt: string | null;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  title: string;
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
