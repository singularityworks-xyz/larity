import { Elysia, t } from "elysia";
import { ZodError } from "zod";
import { requireAuth } from "../middleware/auth";
import {
  getHttpStatusForError,
  MeetingSessionError,
  meetingSessionService,
} from "../services/meeting-session.service";
import {
  endSessionSchema,
  sessionIdSchema,
  startSessionSchema,
} from "../validators/meeting-session";

/**
 * Meeting Session Routes
 *
 * Endpoints for managing live meeting sessions.
 * All routes require authentication.
 *
 * Base path: /meeting-session
 */
export const meetingSessionRoutes = new Elysia({ prefix: "/meeting-session" })
  .use(requireAuth)

  /**
   * POST /meeting-session/start
   *
   * Start a new meeting session.
   * Creates a session in Redis and returns WebSocket connection details.
   *
   * Request body:
   * - meetingId: UUID of the meeting to start
   * - metadata: Optional device/client info
   *
   * Response:
   * - sessionId: UUID for the new session
   * - meetingId: The meeting ID
   * - status: Current session status
   * - websocketUrl: URL to connect WebSocket
   * - createdAt: Timestamp
   */
  .post(
    "/start",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return {
          success: false,
          error: "User not authenticated",
        };
      }

      try {
        // Validate request body
        const validatedInput = startSessionSchema.parse(body);

        // Start session
        const result = await meetingSessionService.start(
          validatedInput,
          user.id
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        // Handle validation errors
        if (error instanceof ZodError) {
          set.status = 400;
          return {
            success: false,
            error: "Validation failed",
            details: error.issues,
          };
        }

        // Handle session-specific errors
        if (error instanceof MeetingSessionError) {
          set.status = getHttpStatusForError(error.code);
          return {
            success: false,
            error: error.code,
            message: error.message,
          };
        }

        // Unknown error
        console.error("[meeting-session/start] Error:", error);
        set.status = 500;
        return {
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to start session",
        };
      }
    },
    {
      body: t.Object({
        meetingId: t.String(),
        metadata: t.Optional(
          t.Object({
            deviceType: t.Optional(t.String()),
            audioSource: t.Optional(t.String()),
            clientVersion: t.Optional(t.String()),
          })
        ),
      }),
    }
  )

  /**
   * POST /meeting-session/end
   *
   * End an active meeting session.
   * Cleans up Redis state and updates meeting status.
   *
   * Request body:
   * - sessionId: UUID of the session to end
   * - reason: Optional reason for ending
   */
  .post(
    "/end",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return {
          success: false,
          error: "User not authenticated",
        };
      }

      try {
        const validatedInput = endSessionSchema.parse(body);

        const result = await meetingSessionService.end(validatedInput, user.id);

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof MeetingSessionError) {
          set.status = getHttpStatusForError(error.code);
          return {
            success: false,
            error: error.code,
            message: error.message,
          };
        }

        console.error("[meeting-session/end] Error:", error);
        set.status = 500;
        return {
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to end session",
        };
      }
    },
    {
      body: t.Object({
        sessionId: t.String(),
        reason: t.Optional(t.String()),
      }),
    }
  )

  /**
   * GET /meeting-session/:id/status
   *
   * Get current status of a session.
   */
  .get(
    "/:id/status",
    async ({ params, set }) => {
      try {
        const { id } = sessionIdSchema.parse(params);

        const status = await meetingSessionService.getStatus(id);

        if (!status) {
          set.status = 404;
          return {
            success: false,
            error: "SESSION_NOT_FOUND",
            message: "Session not found",
          };
        }

        return {
          success: true,
          data: status,
        };
      } catch (error) {
        console.error("[meeting-session/:id/status] Error:", error);
        set.status = 500;
        return {
          success: false,
          error: "INTERNAL_ERROR",
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )

  /**
   * GET /meeting-session/by-meeting/:meetingId
   *
   * Get session status by meeting ID.
   * Useful when you have the meeting ID but not the session ID.
   */
  .get(
    "/by-meeting/:meetingId",
    async ({ params, set }) => {
      try {
        const meetingId = params.meetingId;

        const status = await meetingSessionService.getByMeetingId(meetingId);

        if (!status) {
          set.status = 404;
          return {
            success: false,
            error: "SESSION_NOT_FOUND",
            message: "No active session for this meeting",
          };
        }

        return {
          success: true,
          data: status,
        };
      } catch (error) {
        console.error("[meeting-session/by-meeting] Error:", error);
        set.status = 500;
        return {
          success: false,
          error: "INTERNAL_ERROR",
        };
      }
    },
    {
      params: t.Object({
        meetingId: t.String(),
      }),
    }
  )

  /**
   * POST /meeting-session/:id/validate
   *
   * Validate if a session ID is valid.
   * Used by the realtime server before accepting connections.
   */
  .post(
    "/:id/validate",
    async ({ params }) => {
      const { id } = params;

      const isValid = await meetingSessionService.isValidSession(id);

      return {
        success: true,
        data: { valid: isValid },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  );
