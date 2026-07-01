import { Elysia } from "elysia";
import { z } from "zod";
import { createControlLogger } from "../logger";
import { requireOrg } from "../middleware/auth";
import { PolicyGuardrailService } from "../services";
import {
  createPolicyGuardrailSchema,
  policyGuardrailIdSchema,
  policyGuardrailQuerySchema,
  updatePolicyGuardrailSchema,
} from "../validators";

const log = createControlLogger("policy-guardrails-routes");

export const policyGuardrailsRoutes = new Elysia({
  prefix: "/policy-guardrails",
})
  .use(requireOrg) // Enforce tenant isolation
  // List all policy guardrails
  .get(
    "/",
    async ({ query, user }) => {
      const guardrails = await PolicyGuardrailService.findAll(
        user?.orgId!,
        query
      );
      return { success: true, data: guardrails };
    },
    { query: policyGuardrailQuerySchema }
  )
  // Get active guardrails for a client (includes org-level)
  .get(
    "/active",
    async ({ query, set, user }) => {
      if (!query?.clientId) {
        set.status = 400;
        return {
          success: false,
          error: "clientId is required",
        };
      }
      const guardrails = await PolicyGuardrailService.findActiveForClient(
        user?.orgId!,
        query.clientId
      );
      return { success: true, data: guardrails };
    },
    {
      query: z.object({
        clientId: z.string().uuid(),
      }),
    }
  )
  // Get policy guardrail by id
  .get(
    "/:id",
    async ({ params, set, user }) => {
      const guardrail = await PolicyGuardrailService.findById(
        params.id,
        user?.orgId!
      );
      if (!guardrail) {
        set.status = 404;
        return { success: false, error: "Policy guardrail not found" };
      }
      return { success: true, data: guardrail };
    },
    { params: policyGuardrailIdSchema }
  )
  // Create policy guardrail
  .post(
    "/",
    async ({ body, set, user }) => {
      try {
        // Enforce the user's orgId on the created guardrail
        const guardrail = await PolicyGuardrailService.create({
          ...body,
          orgId: user?.orgId!,
        });
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid reference (org, client, or creator)",
          };
        }
        throw e;
      }
    },
    { body: createPolicyGuardrailSchema.omit({ orgId: true }) }
  )
  // Seed default guardrails for an org
  .post(
    "/seed",
    // biome-ignore lint/suspicious/noExplicitAny: user is derived from global auth middleware
    async ({ body, user, set }: any) => {
      try {
        const orgId = user?.orgId;
        if (!orgId) {
          set.status = 400;
          return { success: false, error: "User has no organization context" };
        }
        if (body.orgId && body.orgId !== orgId) {
          set.status = 403;
          return {
            success: false,
            error: "Forbidden: cross-org seeding is not allowed",
          };
        }
        const result = await PolicyGuardrailService.seedDefaultForOrg(orgId);
        return { success: true, data: result };
      } catch (e: unknown) {
        log.error(
          { err: e, orgId: user?.orgId },
          "Failed to seed default policy guardrails"
        );
        set.status = 500;
        return {
          success: false,
          error: "Failed to seed default policy guardrails",
        };
      }
    },
    { body: z.object({ orgId: z.string().uuid().optional() }) }
  )
  // Update policy guardrail
  .patch(
    "/:id",
    async ({ params, body, set, user }) => {
      try {
        const guardrail = await PolicyGuardrailService.update(
          params.id,
          user?.orgId!,
          body
        );
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Policy guardrail not found"
        ) {
          set.status = 404;
          return { success: false, error: "Policy guardrail not found" };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema, body: updatePolicyGuardrailSchema }
  )
  // Delete policy guardrail
  .delete(
    "/:id",
    async ({ params, set, user }) => {
      try {
        await PolicyGuardrailService.delete(params.id, user?.orgId!);
        return { success: true, message: "Policy guardrail deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Policy guardrail not found"
        ) {
          set.status = 404;
          return { success: false, error: "Policy guardrail not found" };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  )
  // Activate guardrail
  .post(
    "/:id/activate",
    async ({ params, set, user }) => {
      try {
        const guardrail = await PolicyGuardrailService.activate(
          params.id,
          user?.orgId!
        );
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Policy guardrail not found"
        ) {
          set.status = 404;
          return { success: false, error: "Policy guardrail not found" };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  )
  // Deactivate guardrail
  .post(
    "/:id/deactivate",
    async ({ params, set, user }) => {
      try {
        const guardrail = await PolicyGuardrailService.deactivate(
          params.id,
          user?.orgId!
        );
        return { success: true, data: guardrail };
      } catch (e: unknown) {
        const err = e as { code?: string };
        const errObj = e as Error;
        if (
          err.code === "P2025" ||
          errObj.message === "Policy guardrail not found"
        ) {
          set.status = 404;
          return { success: false, error: "Policy guardrail not found" };
        }
        throw e;
      }
    },
    { params: policyGuardrailIdSchema }
  );
