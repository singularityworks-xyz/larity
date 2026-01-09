import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

// Enums
export const ClientStatus = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);
export type ClientStatus = z.infer<typeof ClientStatus>;

// ID schemas
export const clientIdSchema = z.object({
  id: z.uuid('Invalid client ID'),
});

export const clientSlugSchema = z.object({
  slug: z.string().min(1),
});

// Create schema
export const createClientSchema = z.object({
  orgId: z.uuid('Invalid organization ID'),
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  slug: z
    .string()
    .min(1, 'Slug is required')
    .max(100, 'Slug must be less than 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  description: z.string().max(1000).optional(),
  industry: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Update schema
export const updateClientSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens')
    .optional(),
  description: z.string().max(1000).optional(),
  industry: z.string().max(100).optional(),
  status: ClientStatus.optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Query schema with pagination
export const clientQuerySchema = z
  .object({
    orgId: z.uuid().optional(),
    status: ClientStatus.optional(),
  })
  .extend(paginationSchema.shape);

// Type exports
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQueryInput = z.infer<typeof clientQuerySchema>;
