import { Elysia } from 'elysia';
import { z } from 'zod';
import { ReminderService } from '../services';
import {
  createReminderSchema,
  reminderIdSchema,
  reminderQuerySchema,
  updateReminderSchema,
} from '../validators';

export const remindersRoutes = new Elysia({ prefix: '/reminders' })
  // List all reminders
  .get(
    '/',
    async ({ query }) => {
      const reminders = await ReminderService.findAll(query);
      return { success: true, data: reminders };
    },
    { query: reminderQuerySchema }
  )
  // Get due reminders
  .get(
    '/due',
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
  // Get reminder by id
  .get(
    '/:id',
    async ({ params, set }) => {
      const reminder = await ReminderService.findById(params.id);
      if (!reminder) {
        set.status = 404;
        return { success: false, error: 'Reminder not found' };
      }
      return { success: true, data: reminder };
    },
    { params: reminderIdSchema }
  )
  // Create reminder
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const reminder = await ReminderService.create(body);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2003') {
          set.status = 400;
          return { success: false, error: 'Invalid reference (user or client)' };
        }
        throw e;
      }
    },
    { body: createReminderSchema }
  )
  // Update reminder
  .patch(
    '/:id',
    async ({ params, body, set }) => {
      try {
        const reminder = await ReminderService.update(params.id, body);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Reminder not found' };
        }
        throw e;
      }
    },
    { params: reminderIdSchema, body: updateReminderSchema }
  )
  // Delete reminder
  .delete(
    '/:id',
    async ({ params, set }) => {
      try {
        await ReminderService.delete(params.id);
        return { success: true, message: 'Reminder deleted' };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Reminder not found' };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  // Trigger reminder
  .post(
    '/:id/trigger',
    async ({ params, set }) => {
      try {
        const reminder = await ReminderService.trigger(params.id);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Reminder not found' };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  // Dismiss reminder
  .post(
    '/:id/dismiss',
    async ({ params, set }) => {
      try {
        const reminder = await ReminderService.dismiss(params.id);
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Reminder not found' };
        }
        throw e;
      }
    },
    { params: reminderIdSchema }
  )
  // Snooze reminder
  .post(
    '/:id/snooze',
    async ({ params, body, set }) => {
      try {
        const reminder = await ReminderService.snooze(params.id, new Date(body.dueAt));
        return { success: true, data: reminder };
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === 'P2025') {
          set.status = 404;
          return { success: false, error: 'Reminder not found' };
        }
        throw e;
      }
    },
    {
      params: reminderIdSchema,
      body: z.object({ dueAt: z.string().datetime() }),
    }
  );
