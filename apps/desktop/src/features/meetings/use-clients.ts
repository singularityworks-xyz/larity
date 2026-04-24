import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClientSummary } from "./types";

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const clients = await api.get<ClientSummary[]>("/clients");
      return clients;
    },
  });
}
