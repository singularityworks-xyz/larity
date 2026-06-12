import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface CreateMeetingParticipantInput {
  meetingId: string;
  userId?: string;
  externalName?: string;
  externalEmail?: string;
  role?: string;
  attendedAt?: string;
}

export function useCreateMeetingParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetingParticipantInput) => {
      return api.post(`/meetings/${input.meetingId}/participants`, {
        userId: input.userId,
        externalName: input.externalName,
        externalEmail: input.externalEmail,
        role: input.role,
        attendedAt: input.attendedAt,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["meetings", variables.meetingId, "participants"],
      });
    },
  });
}
