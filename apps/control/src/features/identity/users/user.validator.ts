import { z } from "zod";

export const UserRole = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type UserRole = z.infer<typeof UserRole>;

const betterAuthId = z
  .string()
  .length(32, "Invalid user ID")
  .regex(/^[a-zA-Z0-9]+$/, "Invalid user ID");

export const userIdSchema = z.object({
  id: betterAuthId,
});

export const createUserSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters"),
  email: z.email("Invalid email address").trim().toLowerCase(),
  orgId: z.uuid("Invalid organization ID").optional(),
  role: UserRole.default("MEMBER"),
  image: z.url().optional(),
  timezone: z.string().max(50).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.email("Invalid email address").trim().toLowerCase().optional(),
  role: UserRole.optional(),
  image: z.url().optional().nullable(),
  timezone: z.string().max(50).optional().nullable(),
});

export const userQuerySchema = z
  .object({
    orgId: z.uuid().optional(),
    role: UserRole.optional(),
  })
  .optional();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
