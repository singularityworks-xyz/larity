import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { JoinSessionResponse } from "./types";

interface JoinInput {
  sessionId: string;
}

export function useJoinMeeting() {
  return useMutation({
    mutationFn: (input: JoinInput) =>
      api.post<JoinSessionResponse>("/meeting-session/join", {
        sessionId: input.sessionId,
      }),
  });
}
