import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConfirmSpeakerMappingInput {
  clientMemberId: string;
  deepgramIndex: string;
  meetingId: string;
}

export function useConfirmSpeakerMapping() {
  return useMutation({
    mutationFn: (input: ConfirmSpeakerMappingInput) =>
      api.post(`/meetings/${input.meetingId}/speaker-mappings`, {
        deepgramIndex: input.deepgramIndex,
        clientMemberId: input.clientMemberId,
      }),
  });
}
