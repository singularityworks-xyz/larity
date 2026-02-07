import { z } from "zod";
import { paginationSchema } from "../lib/pagination";

// Enums
export const OpenQuestionStatus = z.enum(["OPEN", "RESOLVED", "DEFERRED"]);
export type OpenQuestionStatus = z.infer<typeof OpenQuestionStatus>;

// ID schemas
export const openQuestionIdSchema = z.object({
  id: z.uuid("Invalid open question ID"),
});

// Create schema
export const createOpenQuestionSchema = z.object({
  clientId: z.uuid("Invalid client ID"),
  question: z.string().min(1, "Question is required").max(2000),
  meetingId: z.uuid("Invalid meeting ID").optional(),
  assigneeId: z.uuid("Invalid user ID").optional(),
  context: z.string().max(5000).optional(),
  dueAt: z.coerce.date().optional(),
});

// Update schema
export const updateOpenQuestionSchema = z.object({
  question: z.string().min(1).max(2000).optional(),
  assigneeId: z.uuid().optional().nullable(),
  context: z.string().max(5000).optional(),
  status: OpenQuestionStatus.optional(),
  resolvedByDecisionId: z.uuid().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
});

// Query schema with pagination
export const openQuestionQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    meetingId: z.uuid().optional(),
    assigneeId: z.uuid().optional(),
    status: OpenQuestionStatus.optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

// Type exports
export type CreateOpenQuestionInput = z.infer<typeof createOpenQuestionSchema>;
export type UpdateOpenQuestionInput = z.infer<typeof updateOpenQuestionSchema>;
export type OpenQuestionQueryInput = z.infer<typeof openQuestionQuerySchema>;
