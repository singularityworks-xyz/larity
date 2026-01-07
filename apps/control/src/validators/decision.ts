import { z } from 'zod';

export const createDecisionSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title must be less than 255 characters'),
  content: z.string().min(1, 'Content is required'),
  rationale: z.string().optional(),
  evidence: z.string().optional(),
  orgId: z.uuid('Invalid organization ID'),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  authorId: z.uuid('Invalid author ID').optional(),
});

export const updateDecisionSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(255, 'Title must be less than 255 characters')
    .optional(),
  content: z.string().min(1, 'Content is required').optional(),
  rationale: z.string().optional(),
  evidence: z.string().optional(),
});

export const decisionIdSchema = z.object({
  id: z.uuid('Invalid decision ID'),
});

export const decisionRefSchema = z.object({
  decisionRef: z.uuid('Invalid decision reference'),
});

export const decisionQuerySchema = z.object({
  orgId: z.uuid('Invalid organization ID').optional(),
  meetingId: z.uuid('Invalid meeting ID').optional(),
  authorId: z.uuid('Invalid author ID').optional(),
  decisionRef: z.uuid('Invalid decision reference').optional(),
});
