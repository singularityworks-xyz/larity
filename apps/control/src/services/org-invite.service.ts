import { randomBytes } from "node:crypto";
import { prisma } from "../lib/prisma";
import type { CreateOrgInviteInput } from "../validators";

const DEFAULT_INVITE_TTL_HOURS = 24 * 7;
const INVITE_CODE_BYTES = 6;
const MAX_CODE_ATTEMPTS = 5;

export class OrgInviteError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "OrgInviteError";
    this.code = code;
  }
}

export function getHttpStatusForOrgInviteError(code: string): number {
  const statusMap: Record<string, number> = {
    FORBIDDEN: 403,
    ORG_NOT_FOUND: 404,
    INVITE_NOT_FOUND: 404,
    INVITE_EXPIRED: 400,
    INVITE_ALREADY_USED: 409,
    USER_ALREADY_IN_ORG: 409,
  };

  return statusMap[code] ?? 500;
}

export const orgInviteService = {
  async create(
    orgId: string,
    invitedByUserId: string,
    input: CreateOrgInviteInput
  ) {
    const actor = await prisma.user.findUnique({
      where: { id: invitedByUserId },
      select: { orgId: true, role: true },
    });

    if (!actor || actor.orgId !== orgId) {
      throw new OrgInviteError(
        "Only organization members can create invites",
        "FORBIDDEN"
      );
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new OrgInviteError(
        "Only OWNER or ADMIN can create invites",
        "FORBIDDEN"
      );
    }

    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true },
    });

    if (!org) {
      throw new OrgInviteError("Organization not found", "ORG_NOT_FOUND");
    }

    const ttlHours = input.ttlHours ?? DEFAULT_INVITE_TTL_HOURS;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = generateInviteCode();
      try {
        return await prisma.orgInvite.create({
          data: {
            orgId,
            code,
            role: input.role,
            invitedByUserId,
            expiresAt,
          },
          include: {
            invitedByUser: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });
      } catch (error) {
        const err = error as { code?: string };
        if (err.code !== "P2002" || attempt === MAX_CODE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new OrgInviteError(
      "Unable to generate unique invite code",
      "INTERNAL_ERROR"
    );
  },

  async listActive(orgId: string, actorUserId: string) {
    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { orgId: true, role: true },
    });

    if (!actor || actor.orgId !== orgId) {
      throw new OrgInviteError("Forbidden", "FORBIDDEN");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new OrgInviteError("Forbidden", "FORBIDDEN");
    }

    return prisma.orgInvite.findMany({
      where: {
        orgId,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        invitedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  async revoke(inviteId: string, actorUserId: string): Promise<void> {
    const invite = await prisma.orgInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, orgId: true, usedAt: true },
    });

    if (!invite) {
      throw new OrgInviteError("Invite not found", "INVITE_NOT_FOUND");
    }

    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { orgId: true, role: true },
    });

    if (!actor || actor.orgId !== invite.orgId) {
      throw new OrgInviteError("Forbidden", "FORBIDDEN");
    }

    if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
      throw new OrgInviteError("Forbidden", "FORBIDDEN");
    }

    if (invite.usedAt) {
      throw new OrgInviteError("Invite already used", "INVITE_ALREADY_USED");
    }

    await prisma.orgInvite.delete({
      where: { id: inviteId },
    });
  },

  redeem(code: string, userId: string) {
    const normalizedCode = code.trim().toUpperCase();

    return prisma.$transaction(async (tx) => {
      const invite = await tx.orgInvite.findUnique({
        where: { code: normalizedCode },
        include: {
          invitedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!invite) {
        throw new OrgInviteError("Invite not found", "INVITE_NOT_FOUND");
      }

      if (invite.usedAt) {
        throw new OrgInviteError("Invite already used", "INVITE_ALREADY_USED");
      }

      if (invite.expiresAt.getTime() <= Date.now()) {
        throw new OrgInviteError("Invite has expired", "INVITE_EXPIRED");
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { orgId: true },
      });

      if (!user) {
        throw new OrgInviteError("Forbidden", "FORBIDDEN");
      }

      if (user.orgId) {
        throw new OrgInviteError(
          "User already belongs to an organization",
          "USER_ALREADY_IN_ORG"
        );
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          orgId: invite.orgId,
          role: invite.role,
        },
      });

      return tx.orgInvite.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          usedByUserId: userId,
        },
        include: {
          invitedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          usedByUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });
  },
};

function generateInviteCode(): string {
  return randomBytes(INVITE_CODE_BYTES).toString("hex").toUpperCase();
}
