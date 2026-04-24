import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { Elysia } from "elysia";

const mockOrgService = {
  findAll: mock(),
  findById: mock(),
  create: mock(),
  update: mock(),
  delete: mock(),
  isOwner: mock(),
};

mock.module("../lib/auth", () => {
  return {
    auth: {
      api: {
        getSession: mock(async () => ({
          session: { id: "session-auth" },
          user: {
            id: "user-1",
            orgId: "org-1",
            role: "OWNER",
          },
        })),
      },
    },
  };
});

mock.module("../services", () => ({
  OrgService: mockOrgService,
}));

import {
  OrgInviteError,
  orgInviteService,
} from "../services/org-invite.service";
import { orgsRoutes } from "./orgs.routes";

describe("orgsRoutes invite endpoints integration", () => {
  const app = new Elysia().use(orgsRoutes);
  const createInviteSpy = spyOn(orgInviteService, "create");
  const listActiveSpy = spyOn(orgInviteService, "listActive");
  const revokeSpy = spyOn(orgInviteService, "revoke");
  const redeemSpy = spyOn(orgInviteService, "redeem");

  beforeEach(() => {
    mockOrgService.findAll.mockReset();
    mockOrgService.findById.mockReset();
    mockOrgService.create.mockReset();
    mockOrgService.update.mockReset();
    mockOrgService.delete.mockReset();
    mockOrgService.isOwner.mockReset();

    createInviteSpy.mockReset();
    listActiveSpy.mockReset();
    revokeSpy.mockReset();
    redeemSpy.mockReset();

    mockOrgService.findAll.mockResolvedValue([]);
  });

  afterAll(() => {
    createInviteSpy.mockRestore();
    listActiveSpy.mockRestore();
    revokeSpy.mockRestore();
    redeemSpy.mockRestore();
  });

  it("creates org invite with POST /orgs/:id/invites", async () => {
    createInviteSpy.mockResolvedValue({
      id: "invite-1",
      orgId: "org-1",
      code: "ABC123",
      role: "MEMBER",
      invitedByUserId: "user-1",
      invitedByUser: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
      },
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-04-20T00:00:00.000Z"),
      usedAt: null,
      usedByUserId: null,
    });

    const response = await app.handle(
      new Request(
        "http://local/orgs/9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e/invites",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "MEMBER", ttlHours: 24 }),
        }
      )
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { code: string };
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.code).toBe("ABC123");
    expect(createInviteSpy).toHaveBeenCalledWith(
      "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
      "user-1",
      {
        role: "MEMBER",
        ttlHours: 24,
      }
    );
  });

  it("lists active invites with GET /orgs/:id/invites", async () => {
    listActiveSpy.mockResolvedValue([
      {
        id: "invite-1",
        orgId: "org-1",
        code: "ABC123",
        role: "MEMBER",
        invitedByUserId: "user-1",
        invitedByUser: {
          id: "user-1",
          name: "Owner",
          email: "owner@example.com",
        },
        expiresAt: new Date("2026-05-01T00:00:00.000Z"),
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
        usedAt: null,
        usedByUserId: null,
      },
    ]);

    const response = await app.handle(
      new Request(
        "http://local/orgs/9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e/invites",
        {
          method: "GET",
        }
      )
    );

    const json = (await response.json()) as {
      success: boolean;
      data: Array<{ code: string }>;
    };

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
    expect(json.data[0]?.code).toBe("ABC123");
    expect(listActiveSpy).toHaveBeenCalledWith(
      "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
      "user-1"
    );
  });

  it("revokes invite with DELETE /orgs/invites/:inviteId", async () => {
    revokeSpy.mockResolvedValue(undefined);

    const response = await app.handle(
      new Request(
        "http://local/orgs/invites/9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
        {
          method: "DELETE",
        }
      )
    );

    const json = (await response.json()) as {
      success: boolean;
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(revokeSpy).toHaveBeenCalledWith(
      "9f4f9165-09f1-4fb9-a8a4-c34f1dc2cb5e",
      "user-1"
    );
  });

  it("redeems invite with POST /orgs/join", async () => {
    redeemSpy.mockResolvedValue({
      id: "invite-1",
      orgId: "org-1",
      code: "ABC123",
      role: "MEMBER",
      invitedByUserId: "user-1",
      invitedByUser: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
      },
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-04-20T00:00:00.000Z"),
      usedAt: new Date("2026-04-20T10:00:00.000Z"),
      usedByUserId: "user-1",
      usedByUser: {
        id: "user-1",
        name: "Owner",
        email: "owner@example.com",
      },
    });

    const response = await app.handle(
      new Request("http://local/orgs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABC123" }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      data: { orgId: string; role: string };
    };

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.orgId).toBe("org-1");
    expect(redeemSpy).toHaveBeenCalledWith("ABC123", "user-1");
  });

  it("maps org invite errors to proper status", async () => {
    redeemSpy.mockRejectedValue(
      new OrgInviteError("Invite expired", "INVITE_EXPIRED")
    );

    const response = await app.handle(
      new Request("http://local/orgs/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ABC123" }),
      })
    );

    const json = (await response.json()) as {
      success: boolean;
      error: string;
    };

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("INVITE_EXPIRED");
  });
});
