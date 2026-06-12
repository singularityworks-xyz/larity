import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface CreateMeetingParticipantInput {
  meetingId: string;
  clientMemberId?: string;
  userId?: string;
  role?: string;
  status?: string;
}

export function useCreateMeetingParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetingParticipantInput) => {
      return api.post(`/meetings/${input.meetingId}/participants`, {
        clientMemberId: input.clientMemberId,
        userId: input.userId,
        role: input.role,
        status: input.status,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["meetings", variables.meetingId, "participants"],
      });
    },
  });
}
