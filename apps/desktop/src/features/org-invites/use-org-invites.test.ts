import { beforeEach, describe, expect, it, mock } from "bun:test";

interface QueryConfig {
  queryKey: Array<string | null | undefined>;
  enabled: boolean;
  queryFn: () => Promise<unknown>;
}

interface MutationConfig<TInput> {
  mutationFn: (input: TInput) => Promise<unknown> | unknown;
  onSuccess?: () => Promise<void> | void;
}

const useQueryMock = mock((config: QueryConfig) => ({
  isPending: false,
  data: [],
  ...config,
}));

const useMutationMock = mock(<TInput>(config: MutationConfig<TInput>) => ({
  isPending: false,
  mutateAsync: config.mutationFn,
  ...config,
}));

const invalidateQueriesMock = mock(async () => Promise.resolve());

const getMock = mock(async (_path: string) => Promise.resolve([]));
const postMock = mock(async (_path: string, _payload: unknown) =>
  Promise.resolve({})
);
const deleteMock = mock(async (_path: string) => Promise.resolve({}));

mock.module("@tanstack/react-query", () => ({
  useQuery: (config: QueryConfig) => useQueryMock(config),
  useMutation: (config: any) => useMutationMock(config),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

mock.module("../../lib/api", () => ({
  api: {
    get: getMock,
    post: postMock,
    delete: deleteMock,
  },
}));

import { useOrgInvites } from "./use-org-invites";

describe("useOrgInvites", () => {
  beforeEach(() => {
    useQueryMock.mockClear();
    useMutationMock.mockClear();
    invalidateQueriesMock.mockClear();
    getMock.mockClear();
    postMock.mockClear();
    deleteMock.mockClear();
  });

  it("enables invite query only for admin/owner roles", async () => {
    useOrgInvites({ orgId: "org-1", role: "MEMBER" });
    const memberQueryConfig = useQueryMock.mock.calls[0]?.[0] as
      | QueryConfig
      | undefined;
    expect(memberQueryConfig?.enabled).toBe(false);

    useQueryMock.mockClear();

    useOrgInvites({ orgId: "org-1", role: "ADMIN" });
    const adminQueryConfig = useQueryMock.mock.calls[0]?.[0] as
      | QueryConfig
      | undefined;

    expect(adminQueryConfig?.enabled).toBe(true);
    expect(adminQueryConfig?.queryKey).toEqual(["org-invites", "org-1"]);

    await adminQueryConfig?.queryFn();
    expect(getMock).toHaveBeenCalledWith("/orgs/org-1/invites");
  });

  it("creates invite with default and custom payloads", async () => {
    useOrgInvites({ orgId: "org-1", role: "OWNER" });

    const createInviteConfig = useMutationMock.mock.calls[0]?.[0] as
      | MutationConfig<{ role?: "ADMIN" | "MEMBER"; ttlHours?: number }>
      | undefined;

    await createInviteConfig?.mutationFn({});
    await createInviteConfig?.mutationFn({ role: "ADMIN", ttlHours: 24 });

    expect(postMock).toHaveBeenNthCalledWith(1, "/orgs/org-1/invites", {
      role: "MEMBER",
    });
    expect(postMock).toHaveBeenNthCalledWith(2, "/orgs/org-1/invites", {
      role: "ADMIN",
      ttlHours: 24,
    });
  });

  it("throws when creating an invite without an organization", async () => {
    useOrgInvites({ role: "OWNER" });

    const createInviteConfig = useMutationMock.mock.calls[0]?.[0] as
      | MutationConfig<{ role?: "ADMIN" | "MEMBER"; ttlHours?: number }>
      | undefined;

    await expect(async () => {
      await createInviteConfig?.mutationFn({ role: "MEMBER" });
    }).toThrow("Organization not found");
  });

  it("revokes invites and invalidates invite queries after mutations", async () => {
    useOrgInvites({ orgId: "org-1", role: "ADMIN" });

    const createInviteConfig = useMutationMock.mock.calls[0]?.[0] as
      | MutationConfig<{ role?: "ADMIN" | "MEMBER"; ttlHours?: number }>
      | undefined;
    const revokeInviteConfig = useMutationMock.mock.calls[1]?.[0] as
      | MutationConfig<string>
      | undefined;

    await revokeInviteConfig?.mutationFn("invite-1");
    expect(deleteMock).toHaveBeenCalledWith("/orgs/invites/invite-1");

    await createInviteConfig?.onSuccess?.();
    await revokeInviteConfig?.onSuccess?.();

    expect(invalidateQueriesMock).toHaveBeenCalledTimes(2);
    expect(invalidateQueriesMock).toHaveBeenNthCalledWith(1, {
      queryKey: ["org-invites", "org-1"],
    });
    expect(invalidateQueriesMock).toHaveBeenNthCalledWith(2, {
      queryKey: ["org-invites", "org-1"],
    });
  });
});
