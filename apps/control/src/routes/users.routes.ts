import { Elysia } from "elysia";
import { UserService } from "../services";
import {
  createUserSchema,
  updateUserSchema,
  userIdSchema,
  userQuerySchema,
} from "../validators";

export const usersRoutes = new Elysia({ prefix: "/users" })
  // List all users (with optional filters)
  .get(
    "/",
    async ({ query }) => {
      const users = await UserService.findAll(query);
      return { success: true, data: users };
    },
    { query: userQuerySchema }
  )
  // Get user by id
  .get(
    "/:id",
    async ({ params, set }) => {
      const user = await UserService.findById(params.id);
      if (!user) {
        set.status = 404;
        return { success: false, error: "User not found" };
      }
      return { success: true, data: user };
    },
    { params: userIdSchema }
  )
  // Get user's client assignments
  .get(
    "/:id/clients",
    async ({ params, set }) => {
      const user = await UserService.findById(params.id);
      if (!user) {
        set.status = 404;
        return { success: false, error: "User not found" };
      }
      const clients = await UserService.getClientAssignments(user.email);
      return { success: true, data: clients };
    },
    { params: userIdSchema }
  )
  // Create user
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const user = await UserService.create(body);
        return { success: true, data: user };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2002") {
          set.status = 409;
          return { success: false, error: "Email already exists" };
        }
        if (err.code === "P2003") {
          set.status = 400;
          return { success: false, error: "Invalid org reference" };
        }
        throw e;
      }
    },
    { body: createUserSchema }
  )
  // Update user
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const user = await UserService.update(params.id, body);
        return { success: true, data: user };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "User not found" };
        }
        if (err.code === "P2002") {
          set.status = 409;
          return { success: false, error: "Email already exists" };
        }
        throw e;
      }
    },
    { params: userIdSchema, body: updateUserSchema }
  )
  // Delete user
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await UserService.delete(params.id);
        return { success: true, message: "User deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "User not found" };
        }
        throw e;
      }
    },
    { params: userIdSchema }
  );
