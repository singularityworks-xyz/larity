/** biome-ignore-all lint/style/noNonNullAssertion: <required for auth> */
import { Elysia } from "elysia";
import { requireAuth } from "../middleware/auth";
import { OrgService } from "../services";
import {
  getHttpStatusForOrgInviteError,
  OrgInviteError,
  orgInviteService,
} from "../services/org-invite.service";
import {
  createOrgInviteSchema,
  createOrgSchema,
  joinOrgSchema,
  orgIdSchema,
  orgInviteIdSchema,
  orgQuerySchema,
  updateOrgSchema,
} from "../validators";

export const orgsRoutes = new Elysia({ prefix: "/orgs" })
  .use(requireAuth)
  // List all orgs
  .get(
    "/",
    async ({ query }) => {
      const orgs = await OrgService.findAll(query);
      return { success: true, data: orgs };
    },
    { query: orgQuerySchema }
  )
  // Get org by id
  .get(
    "/:id",
    async ({ params, set }) => {
      const org = await OrgService.findById(params.id);
      if (!org) {
        set.status = 404;
        return { success: false, error: "Org not found" };
      }
      return { success: true, data: org };
    },
    { params: orgIdSchema }
  )
  // Create org
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const org = await OrgService.create(body, user!.id);
        return { success: true, data: org };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "Organization with this slug already exists",
          };
        }
        throw e;
      }
    },
    { body: createOrgSchema }
  )
  // Update org (owner only)
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      // Check if user is owner
      const isOwner = await OrgService.isOwner(params.id, user!.id);
      if (!isOwner) {
        set.status = 403;
        return {
          success: false,
          error: "Only the org owner can update the organization",
        };
      }

      try {
        const org = await OrgService.update(params.id, body);
        return { success: true, data: org };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Org not found" };
        }
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "Organization with this slug already exists",
          };
        }
        throw e;
      }
    },
    { params: orgIdSchema, body: updateOrgSchema }
  )
  // Delete org (owner only)
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      // Check if user is owner
      const isOwner = await OrgService.isOwner(params.id, user!.id);
      if (!isOwner) {
        set.status = 403;
        return {
          success: false,
          error: "Only the org owner can delete the organization",
        };
      }

      try {
        await OrgService.delete(params.id);
        return { success: true, message: "Org deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Org not found" };
        }
        throw e;
      }
    },
    { params: orgIdSchema }
  )
  // Create invite for org (OWNER or ADMIN)
  .post(
    "/:id/invites",
    async ({ params, body, user, set }) => {
      try {
        const invite = await orgInviteService.create(params.id, user!.id, body);
        return {
          success: true,
          data: {
            id: invite.id,
            code: invite.code,
            role: invite.role,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
          },
        };
      } catch (error) {
        if (error instanceof OrgInviteError) {
          set.status = getHttpStatusForOrgInviteError(error.code);
          return { success: false, error: error.code, message: error.message };
        }
        throw error;
      }
    },
    {
      params: orgIdSchema,
      body: createOrgInviteSchema,
    }
  )
  // List active invites for org (OWNER or ADMIN)
  .get(
    "/:id/invites",
    async ({ params, user, set }) => {
      try {
        const invites = await orgInviteService.listActive(params.id, user!.id);
        return { success: true, data: invites };
      } catch (error) {
        if (error instanceof OrgInviteError) {
          set.status = getHttpStatusForOrgInviteError(error.code);
          return { success: false, error: error.code, message: error.message };
        }
        throw error;
      }
    },
    {
      params: orgIdSchema,
    }
  )
  // Revoke invite (OWNER or ADMIN)
  .delete(
    "/invites/:inviteId",
    async ({ params, user, set }) => {
      try {
        await orgInviteService.revoke(params.inviteId, user!.id);
        return { success: true };
      } catch (error) {
        if (error instanceof OrgInviteError) {
          set.status = getHttpStatusForOrgInviteError(error.code);
          return { success: false, error: error.code, message: error.message };
        }
        throw error;
      }
    },
    {
      params: orgInviteIdSchema,
    }
  )
  // Join org with invite code
  .post(
    "/join",
    async ({ body, user, set }) => {
      try {
        const invite = await orgInviteService.redeem(body.code, user!.id);
        return {
          success: true,
          data: {
            orgId: invite.orgId,
            role: invite.role,
            usedAt: invite.usedAt,
          },
        };
      } catch (error) {
        if (error instanceof OrgInviteError) {
          set.status = getHttpStatusForOrgInviteError(error.code);
          return { success: false, error: error.code, message: error.message };
        }
        throw error;
      }
    },
    {
      body: joinOrgSchema,
    }
  );
