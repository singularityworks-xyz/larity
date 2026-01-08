import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

// Enums
export const DecisionStatus = z.enum(['ACTIVE', 'SUPERSEDED', 'REVOKED']);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

// ID schemas
export const decisionIdSchema = z.object({
  id: z.uuid('Invalid decision ID'),
});

export const decisionRefSchema = z.object({
  decisionRef: z.uuid('Invalid decision reference'),
});

// Create schema - now client-scoped instead of org-scoped
export const createDecisionSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  content: z.string().min(1, 'Content is required'),
  rationale: z.string().max(5000).optional(),
  evidence: z.string().max(10000).optional(),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  tags: z.array(z.string().max(50)).default([]),
});

// Update schema (for revisions)
export const updateDecisionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  rationale: z.string().max(5000).optional().nullable(),
  evidence: z.string().max(10000).optional().nullable(),
  status: DecisionStatus.optional(),
  tags: z.array(z.string().max(50)).optional(),
});

// Revision schema
export const reviseDecisionSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  rationale: z.string().max(5000).optional(),
  evidence: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).optional(),
});

// Query schema - now client-scoped with pagination
export const decisionQuerySchema = z
  .object({
    clientId: z.uuid().optional(),
    meetingId: z.uuid().optional(),
    decisionRef: z.uuid().optional(),
    status: DecisionStatus.optional(),
  })
  .extend(paginationSchema.shape)
  .optional();

// Type exports
export type CreateDecisionInput = z.infer<typeof createDecisionSchema>;
export type UpdateDecisionInput = z.infer<typeof updateDecisionSchema>;
export type ReviseDecisionInput = z.infer<typeof reviseDecisionSchema>;
export type DecisionQueryInput = z.infer<typeof decisionQuerySchema>;
