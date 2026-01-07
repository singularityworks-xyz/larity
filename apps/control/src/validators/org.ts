import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
});

export const updateOrgSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .optional(),
});

export const orgIdSchema = z.object({
  id: z.uuid('Invalid organization ID'),
});

export const orgResponseSchema = z.object({
  id: z.uuid('Invalid organization ID'),
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
