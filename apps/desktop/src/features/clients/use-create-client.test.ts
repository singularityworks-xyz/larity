import { beforeEach, describe, expect, it, mock } from "bun:test";

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
  useMutation: <TInput>(config: MutationConfig<TInput>) =>
    useMutationMock(config),
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

mock.module("../../lib/api", () => ({
  api: {
    post: postMock,
  },
}));

import { useCreateClient } from "./use-create-client";

describe("useCreateClient", () => {
  beforeEach(() => {
    useMutationMock.mockClear();
    invalidateQueriesMock.mockClear();
    postMock.mockClear();
  });

  it("posts required fields and omits empty optional values", async () => {
    const mutation = useCreateClient();

    await mutation.mutationFn({
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

    await mutation.mutationFn({
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

    await mutation.onSuccess?.();

    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["clients"],
    });
  });
});
