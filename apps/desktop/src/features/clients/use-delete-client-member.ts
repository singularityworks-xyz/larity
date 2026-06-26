import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

interface DeleteClientMemberInput {
  clientId: string;
  memberId: string;
}

export function useDeleteClientMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ memberId }: DeleteClientMemberInput): Promise<void> =>
      api.delete<void>(`/clients/members/${memberId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-members", variables.clientId],
      });
    },
  });
}
