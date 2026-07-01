import { Elysia } from "elysia";
import { z } from "zod";
import { requireOrg } from "../middleware/auth";
import { DecisionService } from "../services";
import {
  createDecisionSchema,
  decisionIdSchema,
  decisionQuerySchema,
  decisionRefSchema,
  reviseDecisionSchema,
} from "../validators";

export const decisionsRoutes = new Elysia({ prefix: "/decisions" })
  .use(requireOrg)
  // List all decisions (latest versions only, with optional filters)
  .get(
    "/",
    async ({ query, user }) => {
      const decisions = await DecisionService.findAll(user?.orgId!, query);
      return { success: true, data: decisions };
    },
    { query: decisionQuerySchema }
  )
  // Get decision by id (specific record)
  .get(
    "/:id",
    async ({ params, set, user }) => {
      const decision = await DecisionService.findById(params.id, user?.orgId!);
      if (!decision) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: decision };
    },
    { params: decisionIdSchema }
  )
  // Get latest version of a decision by ref
  .get(
    "/ref/:decisionRef",
    async ({ params, set, user }) => {
      const decision = await DecisionService.findLatestByRef(
        params.decisionRef,
        user?.orgId!
      );
      if (!decision) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: decision };
    },
    { params: decisionRefSchema }
  )
  // Get all versions of a decision (full history)
  .get(
    "/ref/:decisionRef/history",
    async ({ params, set, user }) => {
      const versions = await DecisionService.findAllVersions(
        params.decisionRef,
        user?.orgId!
      );
      if (versions.length === 0) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: versions };
    },
    { params: decisionRefSchema }
  )
  // Get specific version of a decision
  .get(
    "/ref/:decisionRef/version/:version",
    async ({ params, set, user }) => {
      const decision = await DecisionService.findByRefAndVersion(
        params.decisionRef,
        params.version,
        user?.orgId!
      );
      if (!decision) {
        set.status = 404;
        return { success: false, error: "Decision version not found" };
      }
      return { success: true, data: decision };
    },
    {
      params: z.object({
        decisionRef: z.string().uuid(),
        version: z.coerce.number().int().min(1),
      }),
    }
  )
  // Create new decision (version 1)
  .post(
    "/",
    async ({ body, set, user }) => {
      try {
        const decision = await DecisionService.create(user?.orgId!, body);
        return { success: true, data: decision };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid reference (client, meeting, or author)",
          };
        }
        throw e;
      }
    },
    { body: createDecisionSchema }
  )
  // Create new revision of an existing decision
  .post(
    "/ref/:decisionRef/revise",
    async ({ params, body, set, user }) => {
      try {
        const decision = await DecisionService.createRevision(
          user?.orgId!,
          params.decisionRef,
          body
        );
        return { success: true, data: decision };
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === "Decision not found") {
          set.status = 404;
          return { success: false, error: "Decision not found" };
        }
        throw e;
      }
    },
    {
      params: decisionRefSchema,
      body: reviseDecisionSchema,
    }
  )
  // Revoke a decision
  .post(
    "/ref/:decisionRef/revoke",
    async ({ params, set, user }) => {
      try {
        const decision = await DecisionService.revoke(
          params.decisionRef,
          user?.orgId!
        );
        return { success: true, data: decision };
      } catch (e: unknown) {
        const err = e as Error;
        if (err.message === "Active decision not found") {
          set.status = 404;
          return { success: false, error: "Active decision not found" };
        }
        throw e;
      }
    },
    { params: decisionRefSchema }
  )
  // Delete all versions of a decision
  .delete(
    "/ref/:decisionRef",
    async ({ params, set, user }) => {
      const result = await DecisionService.deleteByRef(
        params.decisionRef,
        user?.orgId!
      );
      if (result.count === 0) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, message: `Deleted ${result.count} version(s)` };
    },
    { params: decisionRefSchema }
  )
  // Delete specific decision record by id
  .delete(
    "/:id",
    async ({ params, set, user }) => {
      try {
        await DecisionService.deleteById(params.id, user?.orgId!);
        return { success: true, message: "Decision deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Decision not found" };
        }
        throw e;
      }
    },
    { params: decisionIdSchema }
  );
