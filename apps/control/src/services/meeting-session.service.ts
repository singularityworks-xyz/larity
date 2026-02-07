import { randomUUID } from "node:crypto";
import { redis } from "@larity/packages/infra/redis";
import { redisKeys } from "@larity/packages/infra/redis/keys";
import { prisma } from "../lib/prisma";
import type {
  EndSessionInput,
  SessionStatus,
  SessionStatusResponse,
  StartSessionInput,
  StartSessionResponse,
} from "../validators/meeting-session";

// Environment variable for WebSocket URL
const REALTIME_WS_URL = process.env.REALTIME_WS_URL || "ws://localhost:3001";

// Session TTL in seconds (auto-expire after 4 hours of no activity)
const SESSION_TTL = 4 * 60 * 60;

// Lock TTL in seconds (prevent race conditions)
const LOCK_TTL = 30;

/**
 * Session data stored in Redis
 */
interface SessionData {
  sessionId: string;
  meetingId: string;
  userId: string;
  status: SessionStatus;
  startedAt: number;
  lastActivityAt: number;
  utteranceCount: number;
  metadata?: Record<string, string>;
}

/**
 * Meeting Session Service
 *
 * Handles the lifecycle of live meeting sessions:
 * - Starting sessions (creates Redis state, validates meeting)
 * - Ending sessions (cleans up Redis, updates meeting)
 * - Getting session status
 */
export const meetingSessionService = {
  /**
   * Start a new meeting session
   *
   * Flow:
   * 1. Validate meeting exists and is in correct state
   * 2. Acquire lock to prevent duplicate sessions
   * 3. Create session in Redis
   * 4. Update meeting status to LIVE
   * 5. Return session details with WebSocket URL
   */
  async start(
    input: StartSessionInput,
    _userId: string
  ): Promise<StartSessionResponse> {
    const { meetingId, metadata } = input;

    // Step 1: Validate meeting exists and can be started
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, status: true, title: true },
    });

    if (!meeting) {
      throw new MeetingSessionError("Meeting not found", "MEETING_NOT_FOUND");
    }

    // Only SCHEDULED meetings can be started
    if (meeting.status !== "SCHEDULED") {
      throw new MeetingSessionError(
        `Cannot start session: meeting is ${meeting.status}`,
        "INVALID_MEETING_STATUS"
      );
    }

    // Step 2: Check if there's already an active session for this meeting
    const existingSessionId = await redis.get(
      redisKeys.meetingToSession(meetingId)
    );
    if (existingSessionId) {
      // Check if that session is still valid
      const existingSession = await redis.hgetall(
        redisKeys.meetingSession(existingSessionId)
      );
      if (existingSession && existingSession.status !== "ending") {
        throw new MeetingSessionError(
          "Meeting already has an active session",
          "SESSION_EXISTS"
        );
      }
    }

    // Step 3: Acquire distributed lock
    const lockKey = redisKeys.sessionLock(meetingId);
    const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");

    if (!lockAcquired) {
      throw new MeetingSessionError(
        "Another session is being created for this meeting",
        "LOCK_FAILED"
      );
    }

    try {
      // Step 4: Create session
      const sessionId = randomUUID();
      const now = Date.now();

      const sessionData: SessionData = {
        sessionId,
        meetingId,
        userId: _userId,
        status: "initializing",
        startedAt: now,
        lastActivityAt: now,
        utteranceCount: 0,
        metadata: metadata as Record<string, string> | undefined,
      };

      // Store session in Redis Hash
      const sessionKey = redisKeys.meetingSession(sessionId);
      await redis.hset(sessionKey, this.serializeSession(sessionData));
      await redis.expire(sessionKey, SESSION_TTL);

      // Add to active sessions set
      await redis.sadd(redisKeys.activeSessions(), sessionId);

      // Map meeting to session
      await redis.set(
        redisKeys.meetingToSession(meetingId),
        sessionId,
        "EX",
        SESSION_TTL
      );

      // Step 5: Update meeting status in database
      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: "LIVE",
          startedAt: new Date(now),
        },
      });

      // Build WebSocket URL with session ID
      const websocketUrl = `${REALTIME_WS_URL}?sessionId=${sessionId}`;

      return {
        sessionId,
        meetingId,
        status: "initializing",
        websocketUrl,
        createdAt: now,
      };
    } finally {
      // Always release lock
      await redis.del(lockKey);
    }
  },

  /**
   * End a meeting session
   *
   * Flow:
   * 1. Validate session exists
   * 2. Mark session as ending
   * 3. Update meeting status to ENDED
   * 4. Clean up Redis state
   */
  async end(
    input: EndSessionInput,
    _userId: string
  ): Promise<{ success: boolean; meetingId: string }> {
    const { sessionId, reason } = input;

    // Step 1: Get session data
    const sessionKey = redisKeys.meetingSession(sessionId);
    const sessionData = await redis.hgetall(sessionKey);

    if (!sessionData || Object.keys(sessionData).length === 0) {
      throw new MeetingSessionError("Session not found", "SESSION_NOT_FOUND");
    }

    const { meetingId, status } = sessionData;

    if (!meetingId) {
      throw new MeetingSessionError(
        "Session data corrupted",
        "SESSION_CORRUPTED"
      );
    }

    // Prevent ending already-ending session
    if (status === "ending") {
      throw new MeetingSessionError(
        "Session is already ending",
        "SESSION_ENDING"
      );
    }

    // Step 2: Mark session as ending (other services can see this)
    await redis.hset(sessionKey, "status", "ending");
    await redis.hset(sessionKey, "endedAt", Date.now().toString());
    await redis.hset(sessionKey, "endReason", reason || "user_ended");

    // Step 3: Update meeting in database
    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    // Step 4: Clean up Redis (with short delay to let other services react)
    // The actual cleanup happens after a grace period
    await this.scheduleCleanup(sessionId, meetingId);

    return { success: true, meetingId };
  },

  /**
   * Get session status
   */
  async getStatus(sessionId: string): Promise<SessionStatusResponse | null> {
    const sessionKey = redisKeys.meetingSession(sessionId);
    const data = await redis.hgetall(sessionKey);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    if (!(data.sessionId && data.meetingId && data.startedAt && data.status)) {
      return null;
    }

    const now = Date.now();
    const startedAt = Number.parseInt(data.startedAt, 10);

    return {
      sessionId: data.sessionId,
      meetingId: data.meetingId,
      status: data.status as SessionStatus,
      startedAt,
      duration: now - startedAt,
      utteranceCount: Number.parseInt(data.utteranceCount || "0", 10),
      lastActivityAt: data.lastActivityAt
        ? Number.parseInt(data.lastActivityAt, 10)
        : undefined,
    };
  },

  /**
   * Update session activity (called when utterances are processed)
   */
  async updateActivity(sessionId: string): Promise<void> {
    const sessionKey = redisKeys.meetingSession(sessionId);
    const now = Date.now();

    await redis.hset(sessionKey, {
      lastActivityAt: now.toString(),
      status: "active",
    });

    // Increment utterance count
    await redis.hincrby(sessionKey, "utteranceCount", 1);

    // Refresh TTL
    await redis.expire(sessionKey, SESSION_TTL);
  },

  /**
   * Check if a session is valid (for realtime server validation)
   */
  async isValidSession(sessionId: string): Promise<boolean> {
    const exists = await redis.exists(redisKeys.meetingSession(sessionId));
    return exists === 1;
  },

  /**
   * Get session by meeting ID
   */
  async getByMeetingId(
    meetingId: string
  ): Promise<SessionStatusResponse | null> {
    const sessionId = await redis.get(redisKeys.meetingToSession(meetingId));
    if (!sessionId) {
      return null;
    }
    return this.getStatus(sessionId);
  },

  /**
   * Schedule cleanup of session data
   * Delayed to allow other services to process the session end event
   */
  async scheduleCleanup(sessionId: string, meetingId: string): Promise<void> {
    // In production, you'd use a job queue (RabbitMQ)
    // For now, we'll clean up immediately but keep some data

    // Remove from active sessions
    await redis.srem(redisKeys.activeSessions(), sessionId);

    // Remove meeting-to-session mapping
    await redis.del(redisKeys.meetingToSession(meetingId));

    // Set a short TTL on the session data (keep for 5 minutes for debugging)
    const sessionKey = redisKeys.meetingSession(sessionId);
    await redis.expire(sessionKey, 5 * 60);
  },

  /**
   * Helper: Serialize session data for Redis HSET
   */
  serializeSession(data: SessionData): Record<string, string> {
    return {
      sessionId: data.sessionId,
      meetingId: data.meetingId,
      userId: data.userId,
      status: data.status,
      startedAt: data.startedAt.toString(),
      lastActivityAt: data.lastActivityAt.toString(),
      utteranceCount: data.utteranceCount.toString(),
      ...(data.metadata && { metadata: JSON.stringify(data.metadata) }),
    };
  },
};

/**
 * Custom error class for session-related errors
 */
export class MeetingSessionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MeetingSessionError";
    this.code = code;
  }
}

/**
 * Map error codes to HTTP status codes
 */
export function getHttpStatusForError(code: string): number {
  const statusMap: Record<string, number> = {
    MEETING_NOT_FOUND: 404,
    SESSION_NOT_FOUND: 404,
    INVALID_MEETING_STATUS: 400,
    SESSION_EXISTS: 409,
    LOCK_FAILED: 409,
    SESSION_ENDING: 400,
  };

  return statusMap[code] || 500;
}
