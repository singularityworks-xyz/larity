import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StartSessionResponse } from "./types";

interface StartSessionInput {
  meetingId: string;
}

export function useStartSession() {
  return useMutation({
    mutationFn: (input: StartSessionInput) => {
      return api.post<StartSessionResponse>("/meeting-session/start", {
        meetingId: input.meetingId,
      });
    },
  });
}
