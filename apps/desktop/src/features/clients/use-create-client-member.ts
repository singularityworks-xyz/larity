import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClientMember, ClientMemberRole } from "./types";

interface CreateClientMemberInput {
  clientId: string;
  email?: string;
  image?: string;
  name: string;
  role?: ClientMemberRole;
}

export function useCreateClientMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientMemberInput): Promise<ClientMember> =>
      api.post<ClientMember>(`/clients/${input.clientId}/members`, {
        name: input.name,
        email: input.email,
        image: input.image,
        role: input.role,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-members", variables.clientId],
      });
    },
  });
}
