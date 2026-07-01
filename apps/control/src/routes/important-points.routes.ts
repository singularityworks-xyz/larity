import { Elysia } from "elysia";
import { requireOrg } from "../middleware/auth";
import { ImportantPointService } from "../services";
import {
  createImportantPointSchema,
  importantPointIdSchema,
  importantPointQuerySchema,
} from "../validators";

export const importantPointsRoutes = new Elysia({ prefix: "/important-points" })
  .use(requireOrg)
  // List all important points
  .get(
    "/",
    async ({ query, user }) => {
      const points = await ImportantPointService.findAll(user?.orgId!, query);
      return { success: true, data: points };
    },
    { query: importantPointQuerySchema }
  )
  // Get important point by id
  .get(
    "/:id",
    async ({ params, set, user }) => {
      const point = await ImportantPointService.findById(
        params.id,
        user?.orgId!
      );
      if (!point) {
        set.status = 404;
        return { success: false, error: "Important point not found" };
      }
      return { success: true, data: point };
    },
    { params: importantPointIdSchema }
  )
  // Create important point
  .post(
    "/",
    async ({ body, set, user }) => {
      try {
        const point = await ImportantPointService.create(user?.orgId!, body);
        return { success: true, data: point };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid reference (client, meeting, or speaker)",
          };
        }
        throw e;
      }
    },
    { body: createImportantPointSchema }
  )
  // Delete important point (no update - immutable by design)
  .delete(
    "/:id",
    async ({ params, set, user }) => {
      try {
        await ImportantPointService.delete(params.id, user?.orgId!);
        return { success: true, message: "Important point deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Important point not found" };
        }
        throw e;
      }
    },
    { params: importantPointIdSchema }
  );
