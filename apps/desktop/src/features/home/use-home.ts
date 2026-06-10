import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { HomeData } from "./types";

export function useHome() {
  return useQuery({
    queryKey: ["home"],
    queryFn: () => api.get<HomeData>("/home"),
    refetchInterval: 30_000,
  });
}
