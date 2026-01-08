import { z } from 'zod';

// Better-auth uses 32-character alphanumeric IDs, not UUIDs
const betterAuthId = z
  .string()
  .length(32, 'Invalid user ID')
  .regex(/^[a-zA-Z0-9]+$/, 'Invalid user ID');

// Enums
export const ClientMemberRole = z.enum(['LEAD', 'MEMBER', 'OBSERVER']);
export type ClientMemberRole = z.infer<typeof ClientMemberRole>;

// ID schemas
export const clientMemberIdSchema = z.object({
  id: z.string().uuid('Invalid client member ID'),
});

export const clientMemberParamsSchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  userId: betterAuthId,
});

// Create schema
export const createClientMemberSchema = z.object({
  clientId: z.uuid('Invalid client ID'),
  userId: betterAuthId,
  role: ClientMemberRole.default('MEMBER'),
});

// Update schema
export const updateClientMemberSchema = z.object({
  role: ClientMemberRole,
});

// Query schema
export const clientMemberQuerySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    userId: betterAuthId.optional(),
    role: ClientMemberRole.optional(),
  })
  .optional();

// Type exports
export type CreateClientMemberInput = z.infer<typeof createClientMemberSchema>;
export type UpdateClientMemberInput = z.infer<typeof updateClientMemberSchema>;
