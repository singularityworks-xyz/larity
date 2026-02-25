import { Elysia, t } from "elysia";
import { ZodError } from "zod";
import { createControlLogger } from "../logger";
import { requireAuth } from "../middleware/auth";
import {
  getHttpStatusForError,
  MeetingSessionError,
  meetingSessionService,
} from "../services/meeting-session.service";
import {
  endSessionSchema,
  joinSessionSchema,
  sessionIdSchema,
  startSessionSchema,
  validateSessionSchema,
} from "../validators/meeting-session";

const log = createControlLogger("meeting-session-routes");

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

        log.info(
          {
            sessionId: result.sessionId,
            meetingId: validatedInput.meetingId,
            userId: user.id,
          },
          "Session started"
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          set.status = 400;
          return {
            success: false,
            error: "Validation failed",
            details: error.issues,
          };
        }

        if (error instanceof MeetingSessionError) {
          set.status = getHttpStatusForError(error.code);
          return {
            success: false,
            error: error.code,
            message: error.message,
          };
        }

        log.error({ err: error, userId: user.id }, "Failed to start session");
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
   * POST /meeting-session/join
   *
   * Join an existing meeting session.
   * Returns connection details for participants.
   */
  .post(
    "/join",
    async ({ body, user, set }) => {
      if (!user) {
        set.status = 401;
        return {
          success: false,
          error: "User not authenticated",
        };
      }

      try {
        const validatedInput = joinSessionSchema.parse(body);

        const result = await meetingSessionService.join(
          validatedInput.sessionId,
          user.id
        );

        log.info(
          {
            sessionId: result.sessionId,
            userId: user.id,
          },
          "User joined session"
        );

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          set.status = 400;
          return {
            success: false,
            error: "Validation failed",
            details: error.issues,
          };
        }

        if (error instanceof MeetingSessionError) {
          set.status = getHttpStatusForError(error.code);
          return {
            success: false,
            error: error.code,
            message: error.message,
          };
        }

        log.error({ err: error, userId: user.id }, "Failed to join session");
        set.status = 500;
        return {
          success: false,
          error: "INTERNAL_ERROR",
          message: "Failed to join session",
        };
      }
    },
    {
      body: t.Object({
        sessionId: t.String(),
      }),
    }
  )

  /**
   * POST /meeting-session/end
   *
   * End an active meeting session.
   * Cleans up Redis state and updates meeting status.
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

        log.info(
          {
            sessionId: validatedInput.sessionId,
            reason: validatedInput.reason,
            userId: user.id,
          },
          "Session ended"
        );

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

        log.error(
          { err: error, sessionId: body.sessionId },
          "Failed to end session"
        );
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
        log.error(
          { err: error, sessionId: params.id },
          "Failed to get session status"
        );
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
        log.error(
          { err: error, meetingId: params.meetingId },
          "Failed to get session by meeting ID"
        );
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
    async ({ params, body }) => {
      const { id } = params;

      // Parse body if present (optional for backward compatibility)
      let userId: string | undefined;
      let role: "host" | "participant" | undefined;

      try {
        const validatedBody = validateSessionSchema.parse(body);
        userId = validatedBody.userId;
        role = validatedBody.role as "host" | "participant" | undefined;
      } catch (e) {
        // Body validation failed or missing, ignore
      }

      const isValid = await meetingSessionService.isValidSession(
        id,
        userId,
        role
      );

      return {
        success: true,
        data: { valid: isValid },
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Optional(
        t.Object({
          userId: t.Optional(t.String()),
          role: t.Optional(
            t.Union([t.Literal("host"), t.Literal("participant")])
          ),
        })
      ),
    }
  );
