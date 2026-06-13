import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Client } from "./types";

export function useClients() {
  return useQuery({
    queryKey: ["clients", "list"],
    queryFn: () => api.get<Client[]>("/clients"),
  });
}
