import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface OrgInfo {
  id: string;
  name: string;
}

export function useOrg(orgId?: string | null) {
  return useQuery({
    queryKey: ["org", orgId],
    enabled: Boolean(orgId),
    queryFn: () => api.get<OrgInfo>(`/orgs/${orgId}`),
    staleTime: 60_000,
  });
}
