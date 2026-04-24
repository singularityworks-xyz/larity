import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ActiveSession } from "./types";

export function useActiveSessions() {
  return useQuery({
    queryKey: ["meeting-sessions", "active"],
    queryFn: () => api.get<ActiveSession[]>("/meeting-session/active"),
    refetchInterval: 5000,
  });
}
