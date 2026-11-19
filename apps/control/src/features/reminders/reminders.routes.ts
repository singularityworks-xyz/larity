import { Elysia } from "elysia";
import { z } from "zod";
import { ReminderService } from "./reminder.service";
import {
  createReminderSchema,
  reminderIdSchema,
  reminderQuerySchema,
  updateReminderSchema,
} from "./reminder.validator";

export const remindersRoutes = new Elysia({ prefix: "/reminders" })
  .get(
    "/",
    async ({ query }) => {
      const reminders = await ReminderService.findAll(query);
      return { success: true, data: reminders };
    },
    { query: reminderQuerySchema }
  )
  .get(
    "/due",
    async ({ query }) => {
      const beforeDate = query?.before ? new Date(query.before) : new Date();
      const reminders = await ReminderService.findDue(beforeDate);
      return { success: true, data: reminders };
    },
    {
      query: z
        .object({
          before: z.string().datetime().optional(),
        })
        .optional(),
    }
  )
  .get(
    "/:id",
    async ({ params, set }) => {
      const reminder = await ReminderService.findById(params.id);
      if (!reminder) {
        set.status = 404;
        return { success: false, error: "Reminder not found" };
      }
      return { success: true, data: reminder };
    },
    { params: reminderIdSchema }
  )
  .post(
    "/",
    async ({ body, set }) => {
      try {
        const reminder = await ReminderService.create(body);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2003") {
          set.status = 400;
          return {
            success: false,
            error: "Invalid reference (user or client)",
          };
        }
        throw e;
      }
    },
    { body: createReminderSchema }
  )
  .patch(
    "/:id",
    async ({ params, body, set }) => {
      try {
        const reminder = await ReminderService.update(params.id, body);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Reminder not found" };
        }
        throw e;
      }
    },
    { params: reminderIdSchema, body: updateReminderSchema }
  )
  .delete(
    "/:id",
    async ({ params, set }) => {
      try {
        await ReminderService.delete(params.id);
        return { success: true, message: "Reminder deleted" };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Reminder not found" };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  .post(
    "/:id/trigger",
    async ({ params, set }) => {
      try {
        const reminder = await ReminderService.trigger(params.id);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Reminder not found" };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  .post(
    "/:id/dismiss",
    async ({ params, set }) => {
      try {
        const reminder = await ReminderService.dismiss(params.id);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Reminder not found" };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  .post(
    "/:id/snooze",
    async ({ params, body, set }) => {
      try {
        const reminder = await ReminderService.snooze(
          params.id,
          new Date(body.dueAt)
        );
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "P2025") {
          set.status = 404;
          return { success: false, error: "Reminder not found" };
        }
        throw e;
      }
    },
    {
      params: reminderIdSchema,
      body: z.object({ dueAt: z.string().datetime() }),
    }
  );
