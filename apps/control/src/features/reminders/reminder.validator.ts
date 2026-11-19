import { z } from "zod";
import { paginationSchema } from "../../lib/pagination";

const betterAuthId = z
  .string()
  .length(32, "Invalid user ID")
  .regex(/^[a-zA-Z0-9]+$/, "Invalid user ID");

export const ReminderStatus = z.enum([
  "PENDING",
  "TRIGGERED",
  "DISMISSED",
  "SNOOZED",
]);
export type ReminderStatus = z.infer<typeof ReminderStatus>;

export const ReminderEntityType = z.enum([
  "TASK",
  "MEETING",
  "DECISION",
  "OPEN_QUESTION",
]);
export type ReminderEntityType = z.infer<typeof ReminderEntityType>;

export const reminderIdSchema = z.object({
  id: z.uuid("Invalid reminder ID"),
});

export const createReminderSchema = z.object({
  userId: betterAuthId,
  clientId: z.uuid("Invalid client ID").optional(),
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().max(2000).optional(),
  dueAt: z.coerce.date(),
  linkedEntityType: ReminderEntityType.optional(),
  linkedEntityId: z.uuid().optional(),
});

export const updateReminderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.coerce.date().optional(),
  status: ReminderStatus.optional(),
  linkedEntityType: ReminderEntityType.optional().nullable(),
  linkedEntityId: z.uuid().optional().nullable(),
});

export const reminderQuerySchema = z
  .object({
    userId: betterAuthId.optional(),
    clientId: z.uuid().optional(),
    status: ReminderStatus.optional(),
    linkedEntityType: ReminderEntityType.optional(),
    dueBefore: z.coerce.date().optional(),
    dueAfter: z.coerce.date().optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

export const snoozeReminderSchema = z.object({
  dueAt: z.coerce.date(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ReminderQueryInput = z.infer<typeof reminderQuerySchema>;
