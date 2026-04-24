import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { ClientSummary } from "../meetings/types";

export interface CreateClientInput {
  name: string;
  slug: string;
  description?: string;
  industry?: string;
}

export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClientInput) => {
      const payload = {
        name: input.name,
        slug: input.slug,
        ...(input.description ? { description: input.description } : {}),
        ...(input.industry ? { industry: input.industry } : {}),
      };

      return api.post<ClientSummary>("/clients", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
