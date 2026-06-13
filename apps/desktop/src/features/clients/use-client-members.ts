import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClientMember } from "./types";

export function useClientMembers(clientId: string) {
  return useQuery({
    queryKey: ["client-members", clientId],
    queryFn: (): Promise<ClientMember[]> => {
      return api.get<ClientMember[]>(`/clients/${clientId}/members`);
    },
    enabled: !!clientId,
  });
}
