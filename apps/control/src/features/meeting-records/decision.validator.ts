import { z } from "zod";
import { paginationSchema } from "../../lib/pagination";

export const DecisionStatus = z.enum(["ACTIVE", "SUPERSEDED", "REVOKED"]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const decisionIdSchema = z.object({
  id: z.uuid("Invalid decision ID"),
});

export const decisionRefSchema = z.object({
  decisionRef: z.uuid("Invalid decision reference"),
});

export const createDecisionSchema = z.object({
  clientId: z.uuid("Invalid client ID"),
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must be less than 255 characters"),
  content: z.string().min(1, "Content is required"),
  rationale: z.string().max(5000).optional(),
  evidence: z.string().max(10_000).optional(),
  meetingId: z.uuid("Invalid meeting ID").optional(),
  tags: z.array(z.string().max(50)).default([]),
});

export const updateDecisionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  rationale: z.string().max(5000).optional().nullable(),
  evidence: z.string().max(10_000).optional().nullable(),
  status: DecisionStatus.optional(),
  tags: z.array(z.string().max(50)).optional(),
});

export const reviseDecisionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  rationale: z.string().max(5000).optional(),
  evidence: z.string().max(10_000).optional(),
  tags: z.array(z.string().max(50)).optional(),
});

export const decisionQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    meetingId: z.uuid().optional(),
    decisionRef: z.uuid().optional(),
    status: DecisionStatus.optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type ReviseDecisionInput = z.infer<typeof reviseDecisionSchema>;
export type DecisionQueryInput = z.infer<typeof decisionQuerySchema>;
