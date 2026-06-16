import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ScheduleMeetingInput {
  clientId: string;
  title?: string;
  description?: string;
  agenda?: string;
  scheduledAt: string;
}

export function useScheduleMeeting() {
  return useMutation({
    mutationFn: (input: ScheduleMeetingInput) => {
      const payload = {
        clientId: input.clientId,
        status: "SCHEDULED",
        scheduledAt: input.scheduledAt,
        ...(input.title ? { title: input.title } : {}),
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        ...(input.agenda?.trim() ? { agenda: input.agenda.trim() } : {}),
      };
      return api.post<{ id: string }>("/meetings", payload);
    },
  });
}
