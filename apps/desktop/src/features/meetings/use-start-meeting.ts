import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StartSessionResponse } from "./types";

interface StartAdhocInput {
  clientId: string;
  title?: string;
}

export function useStartMeeting() {
  return useMutation({
    mutationFn: (input: StartAdhocInput) => {
      const payload = {
        clientId: input.clientId,
        ...(input.title ? { title: input.title } : {}),
      };
      return api.post<StartSessionResponse>(
        "/meeting-session/start-adhoc",
        payload
      );
    },
  });
}
