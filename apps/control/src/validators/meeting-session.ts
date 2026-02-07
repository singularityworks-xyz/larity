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
  websocketUrl: z.string(), // URL for WebSocket connection
  createdAt: z.number(),
});

export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>;
