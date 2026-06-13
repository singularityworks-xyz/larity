import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClientMember, ClientMemberRole } from "./types";

interface UpdateClientMemberInput {
  clientId: string;
  memberId: string;
  data: {
    name?: string;
    email?: string;
    image?: string;
    role?: ClientMemberRole;
  };
}

export function useUpdateClientMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberId,
      data,
    }: UpdateClientMemberInput): Promise<ClientMember> => {
      return api.patch<ClientMember>(`/clients/members/${memberId}`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-members", variables.clientId],
      });
    },
  });
}
