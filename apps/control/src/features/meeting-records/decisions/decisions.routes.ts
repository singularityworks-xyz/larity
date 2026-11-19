import { Elysia } from "elysia";
import { z } from "zod";
import { DecisionService } from "./decision.service";
import {
  createDecisionSchema,
  decisionIdSchema,
  decisionQuerySchema,
  decisionRefSchema,
  reviseDecisionSchema,
} from "./decision.validator";

export const decisionsRoutes = new Elysia({ prefix: "/decisions" })
  .get(
    "/",
    async ({ query }) => {
      const decisions = await DecisionService.findAll(query);
      return { success: true, data: decisions };
    },
    { query: decisionQuerySchema }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const decision = await DecisionService.findById(params.id);
      if (!decision) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: decision };
    },
    { params: decisionIdSchema }
  )
  .get(
    "/ref/:decisionRef",
    async ({ params, set }) => {
      const decision = await DecisionService.findLatestByRef(
        params.decisionRef
      );
      if (!decision) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: decision };
    },
    { params: decisionRefSchema }
  )
  .get(
    "/ref/:decisionRef/history",
    async ({ params, set }) => {
      const versions = await DecisionService.findAllVersions(
        params.decisionRef
      );
      if (versions.length === 0) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, data: versions };
    },
    { params: decisionRefSchema }
  )
  .get(
    "/ref/:decisionRef/version/:version",
    async ({ params, set }) => {
      const decision = await DecisionService.findByRefAndVersion(
        params.decisionRef,
        params.version
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
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const decision = await DecisionService.create(body);
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
  .post(
    "/ref/:decisionRef/revise",
    async ({ params, body, set }) => {
      try {
        const decision = await DecisionService.createRevision(
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
  .post(
    "/ref/:decisionRef/revoke",
    async ({ params, set }) => {
      try {
        const decision = await DecisionService.revoke(params.decisionRef);
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
  .delete(
    "/ref/:decisionRef",
    async ({ params, set }) => {
      const result = await DecisionService.deleteByRef(params.decisionRef);
      if (result.count === 0) {
        set.status = 404;
        return { success: false, error: "Decision not found" };
      }
      return { success: true, message: `Deleted ${result.count} version(s)` };
    },
    { params: decisionRefSchema }
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await DecisionService.deleteById(params.id);
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
