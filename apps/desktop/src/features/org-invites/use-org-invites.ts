import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

export interface OrgInvite {
  code: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  role: "ADMIN" | "MEMBER";
}

interface SessionUser {
  orgId?: string | null;
  role?: string;
}

function toSessionUser(user: unknown): SessionUser | undefined {
  if (!user || typeof user !== "object") {
    return;
  }

  const record = user as Record<string, unknown>;
  return {
    orgId: typeof record.orgId === "string" ? record.orgId : null,
    role: typeof record.role === "string" ? record.role : undefined,
  };
}

function canManageInvites(user: SessionUser | undefined): boolean {
  return user?.role === "OWNER" || user?.role === "ADMIN";
}

export function useOrgInvites(user: unknown) {
  const normalizedUser = toSessionUser(user);
  const orgId = normalizedUser?.orgId;
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: ["org-invites", orgId],
    enabled: Boolean(orgId) && canManageInvites(normalizedUser),
    queryFn: () => api.get<OrgInvite[]>(`/orgs/${orgId}/invites`),
  });

  const createInvite = useMutation({
    mutationFn: (input?: { role?: "ADMIN" | "MEMBER"; ttlHours?: number }) => {
      if (!orgId) {
        throw new Error("Organization not found");
      }
      const payload = {
        role: input?.role ?? "MEMBER",
        ...(input?.ttlHours ? { ttlHours: input.ttlHours } : {}),
      };
      return api.post<OrgInvite>(`/orgs/${orgId}/invites`, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: (inviteId: string) =>
      api.delete<{ success: boolean }>(`/orgs/invites/${inviteId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-invites", orgId] });
    },
  });

  return {
    canManage: canManageInvites(normalizedUser),
    invitesQuery,
    createInvite,
    revokeInvite,
  };
}
