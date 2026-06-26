import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import { Elysia, t } from "elysia";
import { createControlLogger } from "../logger";
import { meetingSessionService } from "../services/meeting-session.service";
import { validateSessionSchema } from "../validators/meeting-session";

const log = createControlLogger("internal-session-routes");

/**
 * Internal Session Routes
 *
 * Server-to-server endpoints that do NOT require user authentication.
 * These are only called by trusted internal services (e.g. realtime plane).
 *
 * Base path: /internal/meeting-session
 *
 * ⚠️  Do NOT put user-facing mutation endpoints here.
 *     In production, restrict these to an internal network / shared secret.
 */
export const internalSessionRoutes = new Elysia({
  prefix: "/internal/meeting-session",
})
  /**
   * POST /internal/meeting-session/:id/validate
   *
   * Validate if a session ID is valid.
   * Called by the realtime plane before accepting WebSocket connections.
   */
  .post(
    "/:id/validate",
    async ({ params, body }) => {
      const { id } = params;

      let userId: string | undefined;
      let role: "host" | "participant" | undefined;

      try {
        const validatedBody = validateSessionSchema.parse(body);
        userId = validatedBody.userId;
        role = validatedBody.role as "host" | "participant" | undefined;
      } catch {
        // Body is optional — ignore parse failures
      }

      log.info({ sessionId: id, userId, role }, "Internal session validation");

      const isValid = await meetingSessionService.isValidSession(
        id,
        userId,
        role
      );

      let orgId: string | undefined;
      if (isValid) {
        try {
          const contextStr = await redis.get(redisKeys.meetingContext(id));
          if (contextStr) {
            const context = JSON.parse(contextStr) as Record<string, unknown>;
            if (context && typeof context.orgId === "string") {
              orgId = context.orgId;
            }
          }
        } catch {
          // Ignore
        }
      }

      return {
        success: true,
        data: {
          valid: isValid,
          orgId: orgId || "default",
        },
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
