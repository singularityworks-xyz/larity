import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { CreateClientInput } from "../src/features/clients/use-create-client";
import type { ClientSummary } from "../src/features/meetings/types";

interface MutationConfig<TInput> {
  mutationFn: (input: TInput) => Promise<unknown> | unknown;
  onSuccess?: () => Promise<void> | void;
}

const useMutationMock = mock(<TInput>(config: MutationConfig<TInput>) => ({
  isPending: false,
  mutateAsync: config.mutationFn,
  ...config,
}));

const invalidateQueriesMock = mock(async () => Promise.resolve());
const postMock = mock(async (_path: string, _payload: unknown) =>
  Promise.resolve({
    id: "client-1",
    name: "Acme",
    slug: "acme",
  })
);

mock.module("@tanstack/react-query", () => ({
  useMutation: (config: any) => useMutationMock(config),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

mock.module("../src/lib/api", () => ({
  api: {
    post: postMock,
  },
}));

import { useCreateClient } from "../src/features/clients/use-create-client";

describe("useCreateClient", () => {
  beforeEach(() => {
    useMutationMock.mockClear();
    invalidateQueriesMock.mockClear();
    postMock.mockClear();
  });

  it("posts required fields and omits empty optional values", async () => {
    const mutation = useCreateClient();
    const fn = (mutation as any).mutationFn as (
      input: CreateClientInput
    ) => Promise<ClientSummary>;

    await fn({
      name: "Acme",
      slug: "acme",
      description: "",
      industry: "",
    });

    expect(postMock).toHaveBeenCalledWith("/clients", {
      name: "Acme",
      slug: "acme",
    });
  });

  it("includes optional fields when provided", async () => {
    const mutation = useCreateClient();
    const fn = (mutation as any).mutationFn as (
      input: CreateClientInput
    ) => Promise<ClientSummary>;

    await fn({
      name: "Acme",
      slug: "acme",
      description: "Strategic account",
      industry: "Fintech",
    });

    expect(postMock).toHaveBeenCalledWith("/clients", {
      name: "Acme",
      slug: "acme",
      description: "Strategic account",
      industry: "Fintech",
    });
  });

  it("invalidates clients query after successful creation", async () => {
    const mutation = useCreateClient();

    await ((mutation as any).onSuccess as () => Promise<void>)?.();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["clients"],
    });
  });
});
