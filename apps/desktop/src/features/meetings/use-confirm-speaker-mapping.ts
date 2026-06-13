import { useMutation } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface ConfirmSpeakerMappingInput {
  meetingId: string;
  deepgramIndex: string;
  clientMemberId: string;
}

export function useConfirmSpeakerMapping() {
  return useMutation({
    mutationFn: (input: ConfirmSpeakerMappingInput) => {
      return api.post(`/meetings/${input.meetingId}/speaker-mappings`, {
        deepgramIndex: input.deepgramIndex,
        clientMemberId: input.clientMemberId,
      });
    },
  });
}
