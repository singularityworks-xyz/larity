import { z } from "zod";

export const SessionStatus = z.enum([
  "initializing",
  "active",
  "paused",
  "ending",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const startSessionSchema = z.object({
  meetingId: z.uuid("Meeting ID must be a valid UUID"),

  metadata: z
    .object({
      deviceType: z.enum(["desktop", "mobile", "web"]).optional(),

      audioSource: z.enum(["microphone", "system", "both"]).optional(),

      clientVersion: z.string().optional(),
    })
    .optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;

export const startAdhocSessionSchema = z.object({
  clientId: z.uuid("Client ID must be a valid UUID"),
  title: z
    .string()
    .min(1, "Title must not be empty")
    .max(255, "Title must be less than 255 characters")
    .optional(),
  description: z.string().max(10_000).optional(),
  agenda: z.string().max(10_000).optional(),
  scheduledAt: z.coerce.date().optional(),
  metadata: startSessionSchema.shape.metadata,
});

export type StartAdhocSessionInput = z.infer<typeof startAdhocSessionSchema>;

export const endSessionSchema = z.object({
  sessionId: z.uuid("Session ID must be a valid UUID"),

  reason: z
    .enum(["user_ended", "timeout", "error", "meeting_ended"])
    .optional(),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;

export const sessionIdSchema = z.object({
  id: z.uuid("Session ID must be a valid UUID"),
});

export const joinSessionSchema = z.object({
  sessionId: z.string().uuid("Session ID must be a valid UUID"),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;

export const validateSessionSchema = z.object({
  userId: z.string().optional(),
  role: z.enum(["host", "participant"]).optional(),
});

export type ValidateSessionInput = z.infer<typeof validateSessionSchema>;

export const joinSessionResponseSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  role: z.enum(["host", "participant"]),
  websocketUrl: z.string(),
  joinedAt: z.number(),
  allowNameCustomization: z.boolean(),
});

export type JoinSessionResponse = z.infer<typeof joinSessionResponseSchema>;

export const sessionStatusResponseSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  status: SessionStatus,
  startedAt: z.number(), // Unix timestamp
  duration: z.number(),
  utteranceCount: z.number(),
  lastActivityAt: z.number().optional(),
});

export type SessionStatusResponse = z.infer<typeof sessionStatusResponseSchema>;

export const startSessionResponseSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  status: SessionStatus,
  websocketUrl: z.string(),
  createdAt: z.number(),
  allowNameCustomization: z.boolean(),
});

export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>;

export const activeSessionSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  title: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  hostUserId: z.string().nullable(),
  hostName: z.string().nullable(),
  startedAt: z.number().nullable(),
  participantCount: z.number(),
  allowNameCustomization: z.boolean(),
});

export type ActiveSession = z.infer<typeof activeSessionSchema>;
