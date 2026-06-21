import { randomUUID } from "node:crypto";
import { redis } from "@larity/infra/redis";
import { redisKeys } from "@larity/infra/redis/keys";
import { TTL } from "@larity/infra/redis/ttl";
import {
  createS3Client,
  getS3Config,
  PutObjectCommand,
} from "@larity/infra/s3";
import { prisma } from "../lib/prisma";
import { createControlLogger } from "../logger";
import type {
  ActiveSession,
  EndSessionInput,
  SessionStatus,
  SessionStatusResponse,
  StartAdhocSessionInput,
  StartSessionInput,
  StartSessionResponse,
} from "../validators/meeting-session";

// Environment variable for WebSocket URL
const REALTIME_WS_URL = process.env.REALTIME_WS_URL || "ws://localhost:3001";

// Session TTL in seconds (auto-expire after 4 hours of no activity)
const SESSION_TTL = 4 * 60 * 60;

// Lock TTL in seconds (prevent race conditions)
const LOCK_TTL = 30;

const CONTEXT_LOOKBACK_DAYS = 84;
const CONTEXT_MAX_RESULTS = 100;
const AGENDA_SPLIT_REGEX = /\r?\n/;
const AGENDA_BULLET_PREFIX_REGEX = /^\s*(?:[-*]|\d+[.)])\s*/;
const KEYWORD_HINTS = ["blocklist", "keyword", "blocked"] as const;

interface SessionPreloadedDecision {
  content: string;
  createdAt: number;
  id: string;
  tags: string[];
  title: string;
}

interface SessionPreloadedPolicyGuardrail {
  clientId: string | null;
  description: string;
  id: string;
  keywords: string[];
  name: string;
  pattern: string | null;
  ruleType: string;
  severity: string;
}

interface SessionPreloadedPoint {
  content: string;
  createdAt: number;
  id: string;
}

interface SessionPreloadedContext {
  activePolicyGuardrails: SessionPreloadedPolicyGuardrail[];
  calendarAgendaItems: string[];
  clientId: string;
  clientNameList: string[];
  keywordBlocklists: string[];
  knownConstraints: SessionPreloadedPoint[];
  loadedAt: number;
  meetingId: string;
  openDecisions: SessionPreloadedDecision[];
  orgId: string;
  priorCommitments: SessionPreloadedPoint[];
  sessionId: string;
  version: 1;
}

/**
 * Session data stored in Redis
 */
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

/**
 * Meeting Session Service
 *
 * Handles the lifecycle of live meeting sessions:
 * - Starting sessions (creates Redis state, validates meeting)
 * - Ending sessions (cleans up Redis, updates meeting)
 * - Getting session status
 */
export const meetingSessionService = {
  logger: createControlLogger("meeting-session-service"),

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

      if (!meeting.client) {
        throw new MeetingSessionError(
          "Meeting has no linked client",
          "SESSION_CORRUPTED"
        );
      }

      try {
        await this.preloadContext({
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

      // Store session in Redis Hash
      const sessionKey = redisKeys.meetingSession(sessionId);
      await redis.hset(sessionKey, this.serializeSession(sessionData));
      await redis.expire(sessionKey, SESSION_TTL);

      // Add to active sessions set
      await redis.sadd(redisKeys.activeSessions(), sessionId);

      // Initialize session config with defaults
      const configKey = redisKeys.sessionConfig(sessionId);
      await redis.hset(configKey, "allowNameCustomization", "true");
      await redis.expire(configKey, SESSION_TTL);

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

      // Build WebSocket URL with session ID, user ID, and role
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
      // Always release lock
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
    const configKey = redisKeys.sessionConfig(sessionId);
    const now = Date.now();

    await redis.hset(sessionKey, {
      lastActivityAt: now.toString(),
      status: "active",
    });

    // Increment utterance count
    await redis.hincrby(sessionKey, "utteranceCount", 1);

    // Refresh TTL on both session and config keys
    await redis.expire(sessionKey, SESSION_TTL);
    await redis.expire(configKey, SESSION_TTL);
  },

  /**
   * Check if a session is valid (for realtime server validation)
   */
  async isValidSession(
    sessionId: string,
    userId?: string,
    role?: "host" | "participant"
  ): Promise<boolean> {
    const sessionKey = redisKeys.meetingSession(sessionId);
    const sessionData = await redis.hgetall(sessionKey);

    if (!sessionData || Object.keys(sessionData).length === 0) {
      return false;
    }

    // If userId and role are provided, validate authorization
    if (userId && role) {
      if (role === "host") {
        // Only the user who started the session can be host
        return sessionData.userId === userId;
      }

      if (role === "participant") {
        // Must have joined via the join endpoint (and be in participants set)
        const participantsKey = redisKeys.sessionParticipants(sessionId);
        const isParticipant = await redis.sismember(participantsKey, userId);
        return isParticipant === 1;
      }
    }

    // Default: fail closed if specific validation parameters are missing
    // We require explicit role validation for security
    return false;
  },

  /**
   * Join an existing meeting session
   */
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
    // 1. Check session exists and is active
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

    // 2. Verify user is allowed to join
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

    // 3. Add to participants set
    const participantsKey = redisKeys.sessionParticipants(sessionId);
    await redis.sadd(participantsKey, userId);
    await redis.expire(participantsKey, SESSION_TTL);

    // 4. Read session config
    const configKey = redisKeys.sessionConfig(sessionId);
    const configData = await redis.hget(configKey, "allowNameCustomization");
    const allowNameCustomization = configData !== "false";

    // 5. Return connection details
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
    // Remove from active sessions
    await redis.srem(redisKeys.activeSessions(), sessionId);

    // Fetch orgId from DB
    let orgId: string | undefined;
    try {
      const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        select: {
          client: {
            select: {
              orgId: true,
            },
          },
        },
      });
      if (meeting?.client?.orgId) {
        orgId = meeting.client.orgId;
      }
    } catch (err) {
      this.logger.error(
        { err, meetingId, sessionId },
        `Failed to fetch orgId from DB for meeting ${meetingId}, aborting session S3 dump`
      );
    }

    if (orgId) {
      // Dump session state to S3
      try {
        const commitmentsRaw = await redis.get(
          redisKeys.meetingCommitment(sessionId)
        );
        const finalCommitments = commitmentsRaw
          ? JSON.parse(commitmentsRaw)
          : null;

        const constraintsRaw = await redis.get(
          redisKeys.meetingConstraintLedger(sessionId)
        );
        const finalConstraints = constraintsRaw
          ? JSON.parse(constraintsRaw)
          : null;

        const speakerMap = await redis.hgetall(
          redisKeys.meetingSpeaker(sessionId)
        );

        const topicsRaw = await redis.get(redisKeys.meetingTopic(sessionId));
        const finalTopics = topicsRaw ? JSON.parse(topicsRaw) : null;

        const vadHistoryRaw = await redis.lrange(
          `meeting.vad.${sessionId}`,
          0,
          -1
        );
        const vadHistory = vadHistoryRaw.map((item) => {
          try {
            return JSON.parse(item);
          } catch {
            return item;
          }
        });

        const clockOffsets = await redis.hgetall(
          `meeting.clock_offsets.${sessionId}`
        );

        const sessionState = {
          sessionId,
          meetingId,
          orgId,
          commitments: finalCommitments,
          constraints: finalConstraints,
          speakerMap,
          topics: finalTopics,
          vadHistory,
          clockOffsets,
          timestamp: Date.now(),
        };

        const s3Client = createS3Client();
        try {
          const config = getS3Config();
          const key = `${orgId}/${sessionId}/session_state.json`;

          await s3Client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: key,
              Body: JSON.stringify(sessionState, null, 2),
              ContentType: "application/json",
              ServerSideEncryption: "AES256",
            })
          );
        } finally {
          s3Client.destroy();
        }
      } catch (err) {
        // Fail-safe: do not crash if S3 upload fails, but log it
        this.logger.error(
          { err, sessionId, meetingId, orgId },
          `Session cleanup S3 dump failed for session ${sessionId}`
        );
      }
    } else {
      this.logger.warn(
        { sessionId, meetingId },
        `Aborting session S3 dump for session ${sessionId}: missing or empty orgId`
      );
    }

    // Extend TTL of specified keys to 7 days
    const keysToExtend = [
      redisKeys.meetingSession(sessionId),
      redisKeys.meetingToSession(meetingId),
      redisKeys.meetingCommitment(sessionId),
      redisKeys.meetingConstraintLedger(sessionId),
      redisKeys.meetingSpeaker(sessionId),
      redisKeys.meetingContext(sessionId),
      redisKeys.meetingTopic(sessionId),
      `meeting.topics.${sessionId}`,
      `meeting.cost.${sessionId}`,
      `meeting.clock_offsets.${sessionId}`,
      `meeting.vad.${sessionId}`,
      `meeting:ledger:${sessionId}`,
    ];

    for (const key of keysToExtend) {
      try {
        await redis.expire(key, 7 * 24 * 60 * 60); // 7 days
      } catch {
        // ignore
      }
    }
  },

  async preloadContext(input: {
    sessionId: string;
    meetingId: string;
    clientId: string;
    clientName: string;
    orgId: string;
    orgSettings: unknown;
    agenda: string | null;
  }): Promise<SessionPreloadedContext> {
    const {
      sessionId,
      meetingId,
      clientId,
      clientName,
      orgId,
      orgSettings,
      agenda,
    } = input;

    const lookbackMs = CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const createdAfter = new Date(Date.now() - lookbackMs);

    const [
      decisions,
      constraints,
      priorCommitments,
      guardrails,
      clientMembers,
    ] = await Promise.all([
      prisma.decision.findMany({
        where: {
          clientId,
          status: "ACTIVE",
          createdAt: { gte: createdAfter },
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          title: true,
          content: true,
          tags: true,
          createdAt: true,
        },
      }),
      prisma.importantPoint.findMany({
        where: {
          clientId,
          category: "CONSTRAINT",
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.importantPoint.findMany({
        where: {
          clientId,
          category: "COMMITMENT",
          OR: [{ meetingId: null }, { meetingId: { not: meetingId } }],
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          content: true,
          createdAt: true,
        },
      }),
      prisma.policyGuardrail.findMany({
        where: {
          orgId,
          isActive: true,
        },
        orderBy: { createdAt: "desc" },
        take: CONTEXT_MAX_RESULTS,
        select: {
          id: true,
          name: true,
          description: true,
          ruleType: true,
          severity: true,
          keywords: true,
          pattern: true,
          clientId: true,
        },
      }),
      prisma.clientMember.findMany({
        where: { clientId },
        select: { name: true },
        take: CONTEXT_MAX_RESULTS,
        orderBy: { name: "asc" },
      }),
    ]);

    const guardrailKeywords = guardrails.flatMap((guardrail) =>
      guardrail.keywords.filter((keyword) => keyword.trim().length > 0)
    );
    const settingsKeywords = extractKeywordBlocklists(orgSettings);
    const keywordBlocklists = [
      ...new Set([...settingsKeywords, ...guardrailKeywords]),
    ];

    const clientNameList = [
      clientName,
      ...clientMembers.map((member) => member.name),
    ].filter(
      (name, index, names) =>
        name.trim().length > 0 && names.indexOf(name) === index
    );

    const payload: SessionPreloadedContext = {
      version: 1,
      sessionId,
      meetingId,
      clientId,
      orgId,
      loadedAt: Date.now(),
      openDecisions: decisions.map((decision) => ({
        id: decision.id,
        title: decision.title,
        content: decision.content,
        tags: decision.tags,
        createdAt: decision.createdAt.getTime(),
      })),
      knownConstraints: constraints.map((constraint) => ({
        id: constraint.id,
        content: constraint.content,
        createdAt: constraint.createdAt.getTime(),
      })),
      activePolicyGuardrails: guardrails.map((guardrail) => ({
        id: guardrail.id,
        name: guardrail.name,
        description: guardrail.description,
        ruleType: guardrail.ruleType,
        severity: guardrail.severity,
        keywords: guardrail.keywords,
        pattern: guardrail.pattern,
        clientId: guardrail.clientId,
      })),
      priorCommitments: priorCommitments.map((commitment) => ({
        id: commitment.id,
        content: commitment.content,
        createdAt: commitment.createdAt.getTime(),
      })),
      clientNameList,
      keywordBlocklists,
      calendarAgendaItems: parseAgendaItems(agenda),
    };

    await redis.set(
      redisKeys.meetingContext(sessionId),
      JSON.stringify(payload),
      "EX",
      Math.min(SESSION_TTL, TTL.MEETING_CONTEXT)
    );

    return payload;
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

function parseAgendaItems(agenda: string | null): string[] {
  if (!agenda) {
    return [];
  }

  return agenda
    .split(AGENDA_SPLIT_REGEX)
    .map((line) => line.replace(AGENDA_BULLET_PREFIX_REGEX, "").trim())
    .filter((line) => line.length > 0);
}

function extractKeywordBlocklists(settings: unknown): string[] {
  if (!(settings && typeof settings === "object")) {
    return [];
  }

  const keywords = new Set<string>();
  collectKeywordValues(settings, keywords, false);

  return [...keywords];
}

function collectKeywordValues(
  value: unknown,
  keywords: Set<string>,
  shouldCollectString: boolean
): void {
  if (typeof value === "string") {
    if (!shouldCollectString) {
      return;
    }

    const cleaned = value.trim();
    if (cleaned.length > 0) {
      keywords.add(cleaned);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectKeywordValues(item, keywords, shouldCollectString);
    }
    return;
  }

  if (!(value && typeof value === "object")) {
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const shouldCollectChild = shouldCollectString || hasKeywordHint(key);
    collectKeywordValues(child, keywords, shouldCollectChild);
  }
}

function hasKeywordHint(key: string): boolean {
  const lowered = key.toLowerCase();
  return KEYWORD_HINTS.some((hint) => lowered.includes(hint));
}
