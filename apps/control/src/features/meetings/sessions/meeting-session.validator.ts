import { z } from "zod";

/**
 * Session status enum
 * - 'initializing': Session created but audio not yet flowing
 * - 'active': Audio is being processed
 * - 'paused': Temporarily paused (optional feature)
 * - 'ending': Session is being terminated
 */
export const SessionStatus = z.enum([
  "initializing",
  "active",
  "paused",
  "ending",
]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/**
 * Request to start a new meeting session
 */
export const startSessionSchema = z.object({
  meetingId: z.uuid("Meeting ID must be a valid UUID"),

  // Optional metadata about the session
  metadata: z
    .object({
      // Device info for debugging
      deviceType: z.enum(["desktop", "mobile", "web"]).optional(),

      // Audio source configuration
      audioSource: z.enum(["microphone", "system", "both"]).optional(),

      // Client version for compatibility checks
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

/**
 * Request to end a meeting session
 */
export const endSessionSchema = z.object({
  sessionId: z.uuid("Session ID must be a valid UUID"),

  // Reason for ending (helps with analytics)
  reason: z
    .enum(["user_ended", "timeout", "error", "meeting_ended"])
    .optional(),
});

export type EndSessionInput = z.infer<typeof endSessionSchema>;

/**
 * Session ID parameter validation
 */
export const sessionIdSchema = z.object({
  id: z.uuid("Session ID must be a valid UUID"),
});

/**
 * Request to join an existing meeting session
 */
export const joinSessionSchema = z.object({
  sessionId: z.string().uuid("Session ID must be a valid UUID"),
});

export type JoinSessionInput = z.infer<typeof joinSessionSchema>;

/**
 * Request to validate a session (internal use by realtime server)
 */
export const validateSessionSchema = z.object({
  userId: z.string().optional(),
  role: z.enum(["host", "participant"]).optional(),
});

export type ValidateSessionInput = z.infer<typeof validateSessionSchema>;

/**
 * Response type for joining a session
 */
export const joinSessionResponseSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  role: z.enum(["host", "participant"]),
  websocketUrl: z.string(),
  joinedAt: z.number(),
  allowNameCustomization: z.boolean(),
});

export type JoinSessionResponse = z.infer<typeof joinSessionResponseSchema>;

/**
 * Response type for session status
 */
export const sessionStatusResponseSchema = z.object({
  sessionId: z.string(),
  meetingId: z.string(),
  status: SessionStatus,
  startedAt: z.number(), // Unix timestamp
  duration: z.number(), // Milliseconds since start
  utteranceCount: z.number(),
  lastActivityAt: z.number().optional(),
});

export type SessionStatusResponse = z.infer<typeof sessionStatusResponseSchema>;

/**
 * Response type for starting a session
 */
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
