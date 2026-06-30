import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

type ISODateString = string;

interface CreateMeetingParticipantInput {
  /** ISO 8601 datetime string */
  attendedAt?: ISODateString;
  externalEmail?: string;
  externalName?: string;
  meetingId: string;
  role?: string;
  userId?: string;
}

export function useCreateMeetingParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateMeetingParticipantInput) =>
      api.post(`/meetings/${input.meetingId}/participants`, {
        userId: input.userId,
        externalName: input.externalName,
        externalEmail: input.externalEmail,
        role: input.role,
        attendedAt: input.attendedAt,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["meetings", variables.meetingId, "participants"],
      });
    },
  });
}
