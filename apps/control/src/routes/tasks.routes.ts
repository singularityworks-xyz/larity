import { Elysia } from "elysia";
import { TaskService } from "../services";
import {
  createTaskSchema,
  taskIdSchema,
  taskQuerySchema,
  updateTaskSchema,
} from "../validators";

export const tasksRoutes = new Elysia({ prefix: "/tasks" })
  // List all tasks (with optional filters)
  .get(
    "/",
    async ({ query }) => {
      const tasks = await TaskService.findAll(query);
      return { success: true, data: tasks };
    },
    { query: taskQuerySchema }
  )
  // Get task by id
  .get(
    "/:id",
    async ({ params, set }) => {
      const task = await TaskService.findById(params.id);
      if (!task) {
        set.status = 404;
        return { success: false, error: "Task not found" };
      }
      return { success: true, data: task };
    },
    { params: taskIdSchema }
  )
  // Create task
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const task = await TaskService.create(body);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error:
              "Invalid reference (client, meeting, decision, assignee, or creator)",
          };
        }
        throw e;
      }
    },
    { body: createTaskSchema }
  )
  // Update task
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const task = await TaskService.update(params.id, body);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid assignee or decision reference",
          };
        }
        throw e;
      }
    },
    { params: taskIdSchema, body: updateTaskSchema }
  )
  // Delete task
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await TaskService.delete(params.id);
        return { success: true, message: "Task deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        throw e;
      }
    },
    { params: taskIdSchema }
  )
  // Mark task as complete
  .post(
    "/:id/complete",
    async ({ params, set }) => {
      try {
        const task = await TaskService.markComplete(params.id);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        if (err.code === "P2025" || err.message === "Task not found") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        throw e;
      }
    },
    { params: taskIdSchema }
  )
  // Reopen task
  .post(
    "/:id/reopen",
    async ({ params, set }) => {
      try {
        const task = await TaskService.markOpen(params.id);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        throw e;
      }
    },
    { params: taskIdSchema }
  )
  // Mark task as in progress
  .post(
    "/:id/start",
    async ({ params, set }) => {
      try {
        const task = await TaskService.markInProgress(params.id);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        throw e;
      }
    },
    { params: taskIdSchema }
  )
  // Mark task as blocked
  .post(
    "/:id/block",
    async ({ params, set }) => {
      try {
        const task = await TaskService.markBlocked(params.id);
        return { success: true, data: task };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Task not found" };
        }
        throw e;
      }
    },
    { params: taskIdSchema }
  );
