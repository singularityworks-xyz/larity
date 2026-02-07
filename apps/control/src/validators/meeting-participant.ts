import { z } from "zod";

// Enums
export const MeetingParticipantRole = z.enum([
  "HOST",
  "PARTICIPANT",
  "OBSERVER",
]);
export type MeetingParticipantRole = z.infer<typeof MeetingParticipantRole>;

// Better-auth uses 32-character alphanumeric IDs, not UUIDs
const betterAuthId = z
  .string()
  .length(32, "Invalid user ID")
  .regex(/^[a-zA-Z0-9]+$/, "Invalid user ID");

// ID schemas
export const meetingParticipantIdSchema = z.object({
  id: z.uuid("Invalid meeting participant ID"),
});

export const meetingParticipantParamsSchema = z.object({
  meetingId: z.uuid("Invalid meeting ID"),
});

// Base create schema (without refinement) - used for .omit() operations
export const createMeetingParticipantBaseSchema = z.object({
  meetingId: z.uuid("Invalid meeting ID"),
  userId: betterAuthId.optional(),
  externalName: z.string().max(255).optional(),
  externalEmail: z.email().optional(),
  role: MeetingParticipantRole.default("PARTICIPANT"),
});

// Create schema - either internal user OR external participant (with refinement)
export const createMeetingParticipantSchema =
  createMeetingParticipantBaseSchema.refine(
    (data) => data.userId || (data.externalName && data.externalEmail),
    {
      message:
        "Either userId or both externalName and externalEmail are required",
    }
  );

// Update schema
export const updateMeetingParticipantSchema = z.object({
  role: MeetingParticipantRole.optional(),
  attendedAt: z.coerce.date().optional(),
});

// Query schema
export const meetingParticipantQuerySchema = z
  .object({
    meetingId: z.uuid().optional(),
    userId: betterAuthId.optional(),
    role: MeetingParticipantRole.optional(),
  })
  .optional();

// Type exports
export type CreateMeetingParticipantInput = z.infer<
  typeof createMeetingParticipantSchema
>;
export type UpdateMeetingParticipantInput = z.infer<
  typeof updateMeetingParticipantSchema
>;
