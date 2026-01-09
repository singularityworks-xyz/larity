import { z } from 'zod';

// Enums - Updated to reflect client contacts (not users)
export const ClientMemberRole = z.enum([
  'PRIMARY_CONTACT',
  'CONTACT',
  'STAKEHOLDER',
  'DECISION_MAKER',
]);
export type ClientMemberRole = z.infer<typeof ClientMemberRole>;

// ID schemas
export const clientMemberIdSchema = z.object({
  id: z.uuid('Invalid client member ID'),
});

// Create schema
export const createClientMemberSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  email: z.email('Invalid email').max(255).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  role: ClientMemberRole.default('CONTACT'),
});

// Update schema
export const updateClientMemberSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.email().max(255).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  role: ClientMemberRole.optional(),
});

// Query schema
export const clientMemberQuerySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    role: ClientMemberRole.optional(),
  })
  .optional();

// Type exports
export type CreateClientMemberInput = z.infer<typeof createClientMemberSchema>;
export type UpdateClientMemberInput = z.infer<typeof updateClientMemberSchema>;
