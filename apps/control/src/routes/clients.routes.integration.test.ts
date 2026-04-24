import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Elysia } from "elysia";

const getSessionMock = mock(async () => ({
  session: { id: "session-auth" },
  user: {
    id: "user-1",
    orgId: "org-user",
    role: "OWNER",
  },
}));

const mockClientService = {
  findAll: mock(),
  findById: mock(),
  create: mock(),
  update: mock(),
  delete: mock(),
};

const mockClientMemberService = {
  findByClient: mock(),
  create: mock(),
  update: mock(),
  delete: mock(),
};

mock.module("../lib/auth", () => {
  return {
    auth: {
      api: {
        getSession: getSessionMock,
      },
    },
  };
});

mock.module("../services", () => ({
  ClientService: mockClientService,
  ClientMemberService: mockClientMemberService,
}));

import { clientsRoutes } from "./clients.routes";

describe("clientsRoutes integration", () => {
  const app = new Elysia().use(clientsRoutes);

  beforeEach(() => {
    getSessionMock.mockReset();
    getSessionMock.mockResolvedValue({
      session: { id: "session-auth" },
      user: {
        id: "user-1",
        orgId: "org-user",
        role: "OWNER",
      },
    });

    mockClientService.findAll.mockReset();
    mockClientService.findById.mockReset();
    mockClientService.create.mockReset();
    mockClientService.update.mockReset();
    mockClientService.delete.mockReset();

    mockClientMemberService.findByClient.mockReset();
    mockClientMemberService.create.mockReset();
    mockClientMemberService.update.mockReset();
    mockClientMemberService.delete.mockReset();
  });

  it("creates client for authenticated user's org", async () => {
    mockClientService.create.mockResolvedValue({
      id: "client-1",
      orgId: "org-user",
      name: "Acme",
      slug: "acme",
    });

    const response = await app.handle(
      new Request("http://local/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Acme",
          slug: "acme",
          description: "Strategic account",
        }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { orgId: string };
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.orgId).toBe("org-user");
    expect(mockClientService.create).toHaveBeenCalledWith({
      name: "Acme",
      slug: "acme",
      description: "Strategic account",
      orgId: "org-user",
    });
  });

  it("ignores any orgId provided by the request body", async () => {
    mockClientService.create.mockResolvedValue({
      id: "client-1",
      orgId: "org-user",
      name: "Acme",
      slug: "acme",
    });

    const response = await app.handle(
      new Request("http://local/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Acme",
          slug: "acme",
          orgId: "org-malicious",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockClientService.create).toHaveBeenCalledWith({
      name: "Acme",
      slug: "acme",
      orgId: "org-user",
    });
  });

  it("maps duplicate slug errors to 409", async () => {
    mockClientService.create.mockRejectedValue({ code: "P2002" });

    const response = await app.handle(
      new Request("http://local/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      })
    );

    const json = (await response.json()) as { success: boolean; error: string };

    expect(response.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Client with this slug already exists in the org");
  });

  it("returns 400 when user is not in an organization", async () => {
    getSessionMock.mockResolvedValue({
      session: { id: "session-auth" },
      user: {
        id: "user-1",
        orgId: null,
        role: "OWNER",
      },
    });

    const response = await app.handle(
      new Request("http://local/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Acme", slug: "acme" }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      error: string;
      message: string;
    };

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("ORGANIZATION_REQUIRED");
    expect(json.message).toBe("You must belong to an organization");
    expect(mockClientService.create).not.toHaveBeenCalled();
  });

  it("lists clients scoped to authenticated user's org", async () => {
    mockClientService.findAll.mockResolvedValue([
      {
        id: "client-1",
        orgId: "org-user",
        name: "Acme",
        slug: "acme",
      },
    ]);

    const response = await app.handle(
      new Request(
        "http://local/clients?orgId=9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
        {
          method: "GET",
        }
      )
    );

    const json = (await response.json()) as {
      success: boolean;
      data: Array<{ orgId: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]?.orgId).toBe("org-user");
    expect(mockClientService.findAll).toHaveBeenCalledWith({
      orgId: "org-user",
      limit: 50,
      offset: 0,
    });
  });
});
