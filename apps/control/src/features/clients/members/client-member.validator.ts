import { z } from "zod";

export const ClientMemberRole = z.enum([
  "PRIMARY_CONTACT",
  "CONTACT",
  "STAKEHOLDER",
  "DECISION_MAKER",
]);
export type ClientMemberRole = z.infer<typeof ClientMemberRole>;

export const clientMemberIdSchema = z.object({
  id: z.uuid("Invalid client member ID"),
});

export const createClientMemberSchema = z.object({
  clientId: z.uuid("Invalid client ID"),
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters"),
  email: z.email("Invalid email").max(255).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  image: z.string().url("Must be a valid URL").optional(),
  persona: z.record(z.string(), z.unknown()).nullable().optional(),
  role: ClientMemberRole.default("CONTACT"),
});

export const updateClientMemberSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.email().max(255).optional(),
  phone: z.string().max(50).optional(),
  title: z.string().max(100).optional(),
  department: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
  image: z.string().url("Must be a valid URL").optional(),
  persona: z.record(z.string(), z.unknown()).nullable().optional(),
  role: ClientMemberRole.optional(),
});

export const clientMemberQuerySchema = z
  .object({
    clientId: z.string().uuid().optional(),
    role: ClientMemberRole.optional(),
  })
  .optional();

export type CreateClientMemberInput = z.infer<typeof createClientMemberSchema>;
export type UpdateClientMemberInput = z.infer<typeof updateClientMemberSchema>;
