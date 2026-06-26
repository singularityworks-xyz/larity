import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { StartSessionResponse } from "./types";

interface StartAdhocInput {
  agenda?: string;
  clientId: string;
  description?: string;
  /** ISO 8601 datetime string when scheduling for later */
  scheduledAt?: string;
  title?: string;
}

export function useStartMeeting() {
  return useMutation({
    mutationFn: (input: StartAdhocInput) => {
      const payload = {
        clientId: input.clientId,
        ...(input.title ? { title: input.title } : {}),
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        ...(input.agenda?.trim() ? { agenda: input.agenda.trim() } : {}),
        ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
      };
      return api.post<StartSessionResponse>(
        "/meeting-session/start-adhoc",
        payload
      );
    },
  });
}
