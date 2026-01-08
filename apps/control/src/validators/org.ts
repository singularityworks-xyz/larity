import { z } from 'zod';

// ID schemas
export const orgIdSchema = z.object({
  id: z.uuid('Invalid organization ID'),
});

// Create schema
export const createOrgSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be less than 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  settings: z.record(z.string(), z.any()).optional(),
});

// Update schema
export const updateOrgSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

// Query schema
export const orgQuerySchema = z
  .object({
    slug: z.string().optional(),
  })
  .optional();

// Type exports
export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
