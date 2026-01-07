import { z } from 'zod';

export const UserRole = z.enum(['OWNER', 'MEMBER']);

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must be less than 255 characters'),
  email: z.email('Invalid email address'),
  orgId: z.uuid('Invalid organization ID'),
  role: UserRole.optional(),
  image: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(255, 'Name must be less than 255 characters')
    .optional(),
  email: z.email('Invalid email address').optional(),
  role: UserRole.optional(),
  image: z.string().optional(),
});

export const userIdSchema = z.object({
  id: z.uuid('Invalid user ID'),
});

export const userQuerySchema = z.object({
  orgId: z.uuid('Invalid organization ID').optional(),
  role: UserRole.optional(),
});
