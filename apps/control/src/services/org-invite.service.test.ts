import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockTx = {
  orgInvite: {
    findUnique: mock(),
    update: mock(),
  },
  user: {
    findUnique: mock(),
    update: mock(),
  },
};

const mockPrisma = {
  user: {
    findUnique: mock(),
  },
  org: {
    findUnique: mock(),
  },
  orgInvite: {
    create: mock(),
    findMany: mock(),
    findUnique: mock(),
    delete: mock(),
  },
  $transaction: mock((callback: (tx: typeof mockTx) => unknown) => {
    return callback(mockTx);
  }),
};

mock.module("../lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { orgInviteService } from "./org-invite.service";

describe("OrgInviteService", () => {
  const orgId = "org-123";
  const userId = "user-123";

  beforeEach(() => {
    mockPrisma.user.findUnique.mockReset();
    mockPrisma.org.findUnique.mockReset();
    mockPrisma.orgInvite.create.mockReset();
    mockPrisma.orgInvite.findMany.mockReset();
    mockPrisma.orgInvite.findUnique.mockReset();
    mockPrisma.orgInvite.delete.mockReset();
    mockPrisma.$transaction.mockReset();

    mockTx.orgInvite.findUnique.mockReset();
    mockTx.orgInvite.update.mockReset();
    mockTx.user.findUnique.mockReset();
    mockTx.user.update.mockReset();

    mockPrisma.$transaction.mockImplementation(
      (callback: (tx: typeof mockTx) => unknown) => {
        return callback(mockTx);
      }
    );
  });

  describe("create", () => {
    it("creates invite for owner/admin in same org", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
        role: "OWNER",
      });
      mockPrisma.org.findUnique.mockResolvedValue({ id: orgId });
      mockPrisma.orgInvite.create.mockResolvedValue({
        id: "invite-1",
        code: "ABC123",
        role: "MEMBER",
      });

      const result = await orgInviteService.create(orgId, userId, {
        role: "MEMBER",
      });

      expect(result.code).toBe("ABC123");
      expect(mockPrisma.orgInvite.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.orgInvite.create.mock.calls[0]?.[0];
      expect(createCall.data.orgId).toBe(orgId);
      expect(createCall.data.invitedByUserId).toBe(userId);
      expect(createCall.data.role).toBe("MEMBER");
    });

    it("rejects creator outside org", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId: "other-org",
        role: "OWNER",
      });

      await expect(
        orgInviteService.create(orgId, userId, { role: "MEMBER" })
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("retries code collisions and succeeds", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
        role: "ADMIN",
      });
      mockPrisma.org.findUnique.mockResolvedValue({ id: orgId });
      mockPrisma.orgInvite.create
        .mockRejectedValueOnce({ code: "P2002" })
        .mockResolvedValueOnce({
          id: "invite-2",
          code: "DEF456",
          role: "MEMBER",
        });

      const result = await orgInviteService.create(orgId, userId, {
        role: "MEMBER",
      });

      expect(result.code).toBe("DEF456");
      expect(mockPrisma.orgInvite.create).toHaveBeenCalledTimes(2);
    });
  });

  describe("listActive", () => {
    it("filters active unused non-expired invites", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
        role: "ADMIN",
      });
      mockPrisma.orgInvite.findMany.mockResolvedValue([
        { id: "invite-1", code: "ABC123" },
      ]);

      const result = await orgInviteService.listActive(orgId, userId);

      expect(result).toHaveLength(1);
      const findManyCall = mockPrisma.orgInvite.findMany.mock.calls[0]?.[0];
      expect(findManyCall.where.orgId).toBe(orgId);
      expect(findManyCall.where.usedAt).toBeNull();
      expect(findManyCall.where.expiresAt.gt).toBeInstanceOf(Date);
    });
  });

  describe("revoke", () => {
    it("deletes unused invite for authorized actor", async () => {
      mockPrisma.orgInvite.findUnique.mockResolvedValue({
        id: "invite-1",
        orgId,
        usedAt: null,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
        role: "OWNER",
      });
      mockPrisma.orgInvite.delete.mockResolvedValue({ id: "invite-1" });

      await orgInviteService.revoke("invite-1", userId);

      expect(mockPrisma.orgInvite.delete).toHaveBeenCalledWith({
        where: { id: "invite-1" },
      });
    });

    it("rejects revoking used invite", async () => {
      mockPrisma.orgInvite.findUnique.mockResolvedValue({
        id: "invite-1",
        orgId,
        usedAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: userId,
        orgId,
        role: "OWNER",
      });

      await expect(
        orgInviteService.revoke("invite-1", userId)
      ).rejects.toMatchObject({
        code: "INVITE_ALREADY_USED",
      });
    });
  });

  describe("redeem", () => {
    it("updates user org and marks invite used", async () => {
      mockTx.orgInvite.findUnique.mockResolvedValue({
        id: "invite-1",
        orgId,
        role: "MEMBER",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTx.user.findUnique.mockResolvedValue({
        id: userId,
        orgId: null,
      });
      mockTx.user.update.mockResolvedValue({
        id: userId,
        orgId,
        role: "MEMBER",
      });
      mockTx.orgInvite.update.mockResolvedValue({
        id: "invite-1",
        orgId,
        role: "MEMBER",
        usedByUserId: userId,
      });

      const result = await orgInviteService.redeem("abc123", userId);

      expect(result.usedByUserId).toBe(userId);
      expect(mockTx.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          orgId,
          role: "MEMBER",
        },
      });
      expect(mockTx.orgInvite.update).toHaveBeenCalledTimes(1);
    });

    it("rejects users already in org", async () => {
      mockTx.orgInvite.findUnique.mockResolvedValue({
        id: "invite-1",
        orgId,
        role: "MEMBER",
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTx.user.findUnique.mockResolvedValue({
        id: userId,
        orgId: "existing-org",
      });

      await expect(
        orgInviteService.redeem("abc123", userId)
      ).rejects.toMatchObject({
        code: "USER_ALREADY_IN_ORG",
      });
    });

    it("rejects expired invites", async () => {
      mockTx.orgInvite.findUnique.mockResolvedValue({
        id: "invite-1",
        orgId,
        role: "MEMBER",
        usedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        orgInviteService.redeem("abc123", userId)
      ).rejects.toMatchObject({
        code: "INVITE_EXPIRED",
      });
    });
  });
});
