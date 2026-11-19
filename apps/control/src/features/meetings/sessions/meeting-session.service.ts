import { randomUUID } from "node:crypto";
import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import { prisma } from "../../../lib/prisma";
import type {
  ActiveSession,
  EndSessionInput,
  SessionStatus,
  SessionStatusResponse,
  StartAdhocSessionInput,
  StartSessionInput,
  StartSessionResponse,
} from "./meeting-session.validator";
import { scheduleCleanup } from "./session-cleanup";
import { SESSION_TTL } from "./session-constants";
import { preloadContext } from "./session-context";
import {
  getSessionStatus,
  isValidSession,
  updateSessionActivity,
} from "./session-status.service";

const REALTIME_WS_URL = process.env.REALTIME_WS_URL || "ws://localhost:3001";

// Lock TTL in seconds (prevent race conditions)
const LOCK_TTL = 30;

interface SessionData {
  lastActivityAt: number;
  meetingId: string;
  metadata?: Record<string, string>;
  sessionId: string;
  startedAt: number;
  status: SessionStatus;
  userId: string;
  utteranceCount: number;
}

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

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        clientId: true,
        status: true,
        title: true,
        agenda: true,
        client: {
          select: {
            id: true,
            name: true,
            orgId: true,
            org: {
              select: {
                settings: true,
              },
            },
          },
        },
      },
    });

    if (!meeting) {
      throw new MeetingSessionError("Meeting not found", "MEETING_NOT_FOUND");
    }

    if (meeting.status !== "SCHEDULED") {
      throw new MeetingSessionError(
        `Cannot start session: meeting is ${meeting.status}`,
        "INVALID_MEETING_STATUS"
      );
    }

    const existingSessionId = await redis.get(
      redisKeys.meetingToSession(meetingId)
    );
    if (existingSessionId) {
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

    const lockKey = redisKeys.sessionLock(meetingId);
    const lockAcquired = await redis.set(lockKey, "1", "EX", LOCK_TTL, "NX");

    if (!lockAcquired) {
      throw new MeetingSessionError(
        "Another session is being created for this meeting",
        "LOCK_FAILED"
      );
    }

    try {
      const sessionId = randomUUID();
      const now = Date.now();

      if (!meeting.client) {
        throw new MeetingSessionError(
          "Meeting has no linked client",
          "SESSION_CORRUPTED"
        );
      }

      try {
        await preloadContext({
          sessionId,
          meetingId,
          clientId: meeting.clientId,
          clientName: meeting.client.name,
          orgId: meeting.client.orgId,
          orgSettings: meeting.client.org?.settings,
          agenda: meeting.agenda,
        });
      } catch (error) {
        throw new MeetingSessionError(
          error instanceof Error
            ? error.message
            : "Failed to preload session context",
          "CONTEXT_PRELOAD_FAILED"
        );
      }

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

      const sessionKey = redisKeys.meetingSession(sessionId);
      await redis.hset(sessionKey, this.serializeSession(sessionData));
      await redis.expire(sessionKey, SESSION_TTL);

      await redis.sadd(redisKeys.activeSessions(), sessionId);

      const configKey = redisKeys.sessionConfig(sessionId);
      await redis.hset(configKey, "allowNameCustomization", "true");
      await redis.expire(configKey, SESSION_TTL);

      await redis.set(
        redisKeys.meetingToSession(meetingId),
        sessionId,
        "EX",
        SESSION_TTL
      );

      await prisma.meeting.update({
        where: { id: meetingId },
        data: {
          status: "LIVE",
          startedAt: new Date(now),
        },
      });

      const websocketUrl = `${REALTIME_WS_URL}?sessionId=${sessionId}&userId=${_userId}&role=host`;

      return {
        sessionId,
        meetingId,
        status: "initializing",
        websocketUrl,
        createdAt: now,
        allowNameCustomization: true,
      };
    } finally {
      await redis.del(lockKey);
    }
  },

  async startAdhoc(
    input: StartAdhocSessionInput,
    userId: string
  ): Promise<StartSessionResponse> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });

    if (!user?.orgId) {
      throw new MeetingSessionError(
        "User must belong to an organization to start meetings",
        "UNAUTHORIZED"
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, orgId: true },
    });

    if (!client) {
      throw new MeetingSessionError("Client not found", "CLIENT_NOT_FOUND");
    }

    if (client.orgId !== user.orgId) {
      throw new MeetingSessionError(
        "Unauthorized to start a meeting for this client",
        "UNAUTHORIZED"
      );
    }

    const trimmedDescription = input.description?.trim();
    const trimmedAgenda = input.agenda?.trim();

    const meeting = await prisma.meeting.create({
      data: {
        clientId: input.clientId,
        title: input.title?.trim() || "Untitled meeting",
        ...(trimmedDescription ? { description: trimmedDescription } : {}),
        ...(trimmedAgenda ? { agenda: trimmedAgenda } : {}),
        status: "SCHEDULED",
        scheduledAt: input.scheduledAt ?? new Date(),
      },
      select: { id: true },
    });

    await prisma.meetingParticipant.upsert({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId,
        },
      },
      update: {
        role: "HOST",
        attendedAt: new Date(),
      },
      create: {
        meetingId: meeting.id,
        userId,
        role: "HOST",
        attendedAt: new Date(),
      },
    });

    return this.start(
      {
        meetingId: meeting.id,
        metadata: input.metadata,
      },
      userId
    );
  },

  async end(
    input: EndSessionInput,
    _userId: string
  ): Promise<{ success: boolean; meetingId: string }> {
    const { sessionId, reason } = input;

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

    if (status === "ending") {
      throw new MeetingSessionError(
        "Session is already ending",
        "SESSION_ENDING"
      );
    }

    await redis.hset(sessionKey, "status", "ending");
    await redis.hset(sessionKey, "endedAt", Date.now().toString());
    await redis.hset(sessionKey, "endReason", reason || "user_ended");

    await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "ENDED",
        endedAt: new Date(),
      },
    });

    await scheduleCleanup(sessionId, meetingId);

    return { success: true, meetingId };
  },

  getStatus: getSessionStatus,
  updateActivity: updateSessionActivity,
  isValidSession,

  async join(
    sessionId: string,
    userId: string
  ): Promise<{
    success: boolean;
    sessionId: string;
    meetingId: string;
    role: "host" | "participant";
    websocketUrl: string;
    joinedAt: number;
    allowNameCustomization: boolean;
  }> {
    const sessionKey = redisKeys.meetingSession(sessionId);
    const sessionData = await redis.hgetall(sessionKey);

    if (!sessionData || Object.keys(sessionData).length === 0) {
      throw new MeetingSessionError("Session not found", "SESSION_NOT_FOUND");
    }

    if (sessionData.status === "ending" || sessionData.status === "ended") {
      throw new MeetingSessionError("Session has ended", "SESSION_ENDED");
    }

    const meetingId = sessionData.meetingId;
    if (!meetingId) {
      throw new MeetingSessionError(
        "Session corrupted: missing meetingId",
        "SESSION_CORRUPTED"
      );
    }

    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { client: { select: { orgId: true } } },
    });

    if (!meeting) {
      throw new MeetingSessionError("Meeting not found", "MEETING_NOT_FOUND");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });

    if (!user?.orgId || user.orgId !== meeting.client?.orgId) {
      throw new MeetingSessionError(
        "Unauthorized to join this meeting",
        "UNAUTHORIZED"
      );
    }

    const isHost = sessionData.userId === userId;
    const resolvedRole = isHost ? "HOST" : "PARTICIPANT";
    const responseRole = isHost ? "host" : "participant";

    await prisma.meetingParticipant.upsert({
      where: {
        meetingId_userId: {
          meetingId,
          userId,
        },
      },
      update: {
        role: resolvedRole,
        attendedAt: new Date(),
      },
      create: {
        meetingId,
        userId,
        role: resolvedRole,
        attendedAt: new Date(),
      },
    });

    const participantsKey = redisKeys.sessionParticipants(sessionId);
    await redis.sadd(participantsKey, userId);
    await redis.expire(participantsKey, SESSION_TTL);

    const configKey = redisKeys.sessionConfig(sessionId);
    const configData = await redis.hget(configKey, "allowNameCustomization");
    const allowNameCustomization = configData !== "false";

    const websocketUrl = `${REALTIME_WS_URL}?sessionId=${sessionId}&userId=${userId}&role=${responseRole}`;

    return {
      success: true,
      sessionId,
      meetingId,
      role: responseRole,
      websocketUrl,
      joinedAt: Date.now(),
      allowNameCustomization,
    };
  },

  async getActiveForOrg(userId: string): Promise<ActiveSession[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { orgId: true },
    });

    if (!user?.orgId) {
      return [];
    }

    const meetings = await prisma.meeting.findMany({
      where: {
        status: "LIVE",
        client: {
          orgId: user.orgId,
        },
      },
      select: {
        id: true,
        title: true,
        clientId: true,
        startedAt: true,
        client: {
          select: {
            name: true,
          },
        },
        participants: {
          where: {
            role: "HOST",
          },
          orderBy: {
            attendedAt: "asc",
          },
          take: 1,
          select: {
            userId: true,
            user: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        startedAt: "desc",
      },
    });

    const activeSessions = await Promise.all(
      meetings.map(async (meeting) => {
        const sessionId = await redis.get(
          redisKeys.meetingToSession(meeting.id)
        );
        if (!sessionId) {
          return null;
        }

        const participantCount = await redis.scard(
          redisKeys.sessionParticipants(sessionId)
        );

        const configData = await redis.hget(
          redisKeys.sessionConfig(sessionId),
          "allowNameCustomization"
        );

        const host = meeting.participants[0];

        return {
          sessionId,
          meetingId: meeting.id,
          title: meeting.title,
          clientId: meeting.clientId,
          clientName: meeting.client.name,
          hostUserId: host?.userId ?? null,
          hostName: host?.user?.name ?? null,
          startedAt: meeting.startedAt ? meeting.startedAt.getTime() : null,
          participantCount: participantCount + 1,
          allowNameCustomization: configData !== "false",
        } satisfies ActiveSession;
      })
    );

    return activeSessions.filter(
      (session): session is ActiveSession => session !== null
    );
  },

  async updateConfig(
    sessionId: string,
    userId: string,
    config: { allowNameCustomization: boolean }
  ): Promise<void> {
    const sessionKey = redisKeys.meetingSession(sessionId);
    const sessionData = await redis.hgetall(sessionKey);

    if (!sessionData || Object.keys(sessionData).length === 0) {
      throw new MeetingSessionError("Session not found", "SESSION_NOT_FOUND");
    }

    if (sessionData.userId !== userId) {
      throw new MeetingSessionError(
        "Only the host can update session config",
        "UNAUTHORIZED"
      );
    }

    const configKey = redisKeys.sessionConfig(sessionId);
    await redis.hset(
      configKey,
      "allowNameCustomization",
      config.allowNameCustomization ? "true" : "false"
    );
  },

  async getByMeetingId(
    meetingId: string
  ): Promise<SessionStatusResponse | null> {
    const sessionId = await redis.get(redisKeys.meetingToSession(meetingId));
    if (!sessionId) {
      return null;
    }
    return this.getStatus(sessionId);
  },

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

export class MeetingSessionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MeetingSessionError";
    this.code = code;
  }
}

export function getHttpStatusForError(code: string): number {
  const statusMap: Record<string, number> = {
    MEETING_NOT_FOUND: 404,
    CLIENT_NOT_FOUND: 404,
    SESSION_NOT_FOUND: 404,
    INVALID_MEETING_STATUS: 400,
    SESSION_EXISTS: 409,
    LOCK_FAILED: 409,
    SESSION_ENDING: 400,
    SESSION_CORRUPTED: 500,
    CONTEXT_PRELOAD_FAILED: 500,
    UNAUTHORIZED: 403,
  };

  return statusMap[code] || 500;
}
