import { Elysia } from "elysia";
import { requireOrg, requireOwnerOrAdmin } from "../middleware/auth";
import { ClientMemberService, ClientService } from "../services";
import {
  clientIdSchema,
  clientMemberIdSchema,
  clientQuerySchema,
  createClientMemberSchema,
  createClientSchema,
  updateClientMemberSchema,
  updateClientSchema,
} from "../validators";

export const clientsRoutes = new Elysia({ prefix: "/clients" })
  .use(requireOrg) // ensures user!.orgId! is present
  // List all clients - any authenticated user can view
  .get(
    "/",
    async ({ query, user }) => {
      const clients = await ClientService.findAll({
        ...query,
        orgId: user?.orgId!,
      });
      return { success: true, data: clients };
    },
    { query: clientQuerySchema }
  )
  // Get client by id - any authenticated user can view
  .get(
    "/:id",
    async ({ params, set, user }) => {
      const client = await ClientService.findById(params.id, user?.orgId!);
      if (!client) {
        set.status = 404;
        return { success: false, error: "Client not found" };
      }
      return { success: true, data: client };
    },
    { params: clientIdSchema }
  )
  // Create client - requires OWNER or ADMIN role
  .use(requireOwnerOrAdmin)
  .post(
    "/",
    async ({ body, user, set }) => {
      try {
        const client = await ClientService.create({
          ...body,
          orgId: user?.orgId!,
        });
        return { success: true, data: client };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "Client with this slug already exists in the org",
          };
        }
        if (err.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid org reference" };
        }
        throw e;
      }
    },
    { body: createClientSchema.omit({ orgId: true }) }
  )
  // Update client - requires OWNER or ADMIN role
  .patch(
    "/:id",
    async ({ params, body, set, user }) => {
      try {
        const client = await ClientService.update(
          params.id,
          user?.orgId!,
          body
        );
        return { success: true, data: client };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (err.code === "P2025" || errObj.message === "Client not found") {
          set.status = 404;
          return { success: false, error: "Client not found" };
        }
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "Client with this slug already exists in the org",
          };
        }
        throw e;
      }
    },
    { params: clientIdSchema, body: updateClientSchema }
  )
  // Delete client - requires OWNER or ADMIN role
  .delete(
    "/:id",
    async ({ params, set, user }) => {
      try {
        await ClientService.delete(params.id, user?.orgId!);
        return { success: true, message: "Client deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (err.code === "P2025" || errObj.message === "Client not found") {
          set.status = 404;
          return { success: false, error: "Client not found" };
        }
        throw e;
      }
    },
    { params: clientIdSchema }
  )
  // --- Client Members (External Contacts) ---
  // List members/contacts of a client - requires OWNER or ADMIN role
  .get(
    "/:id/members",
    async ({ params, user }) => {
      const members = await ClientMemberService.findByClient(
        params.id,
        user?.orgId!
      );
      return { success: true, data: members };
    },
    { params: clientIdSchema }
  )
  // Add member/contact to client - requires OWNER or ADMIN role
  .post(
    "/:id/members",
    async ({ params, body, set, user }) => {
      try {
        const member = await ClientMemberService.create(user?.orgId!, {
          ...body,
          clientId: params.id,
        });
        return { success: true, data: member };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (errObj.message === "Client not found or access denied") {
          set.status = 403;
          return { success: false, error: errObj.message };
        }
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "A contact with this email already exists for this client",
          };
        }
        if (err.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid client reference" };
        }
        throw e;
      }
    },
    {
      params: clientIdSchema,
      body: createClientMemberSchema.omit({ clientId: true }),
    }
  )
  // Update member/contact - requires OWNER or ADMIN role
  .patch(
    "/members/:id",
    async ({ params, body, set, user }) => {
      try {
        const member = await ClientMemberService.update(
          params.id,
          user?.orgId!,
          body
        );
        return { success: true, data: member };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Client contact not found"
        ) {
          set.status = 404;
          return { success: false, error: "Client contact not found" };
        }
        if (err.code === "P2002") {
          set.status = 409;
          return {
            success: false,
            error: "A contact with this email already exists for this client",
          };
        }
        throw e;
      }
    },
    { params: clientMemberIdSchema, body: updateClientMemberSchema }
  )
  // Remove member/contact from client - requires OWNER or ADMIN role
  .delete(
    "/members/:id",
    async ({ params, set, user }) => {
      try {
        await ClientMemberService.delete(params.id, user?.orgId!);
        return { success: true, message: "Contact removed from client" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Client contact not found"
        ) {
          set.status = 404;
          return { success: false, error: "Client contact not found" };
        }
        throw e;
      }
    },
    { params: clientMemberIdSchema }
  );
