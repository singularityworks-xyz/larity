import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Client } from "./types";

export function useClient(id: string) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
    enabled: !!id,
  });
}
