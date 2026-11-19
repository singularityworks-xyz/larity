import { Elysia } from "elysia";
import { ImportantPointService } from "./important-point.service";
import {
  createImportantPointSchema,
  importantPointIdSchema,
  importantPointQuerySchema,
} from "./important-point.validator";

export const importantPointsRoutes = new Elysia({ prefix: "/important-points" })
  .get(
    "/",
    async ({ query }) => {
      const points = await ImportantPointService.findAll(query);
      return { success: true, data: points };
    },
    { query: importantPointQuerySchema }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const point = await ImportantPointService.findById(params.id);
      if (!point) {
        set.status = 404;
        return { success: false, error: "Important point not found" };
      }
      return { success: true, data: point };
    },
    { params: importantPointIdSchema }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const point = await ImportantPointService.create(body);
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
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await ImportantPointService.delete(params.id);
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
