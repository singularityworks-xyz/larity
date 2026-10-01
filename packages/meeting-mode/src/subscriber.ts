import { prisma } from "@larity/db/client";
import { redis } from "@larity/db/redis";
import { redisKeys } from "@larity/db/redis/keys";
import { TTL } from "@larity/db/redis/ttl";
import Redis from "ioredis";
import type { SessionEndEvent, SttResult } from "../../stt/src/types";
import {
  extractSessionId,
  isFinalSttChannel,
  isLegacyFinalSttChannel,
  isPartialSttChannel,
  PARTICIPANT_JOIN,
  PARTICIPANT_ROLE_CHANGE_PATTERN,
  SESSION_END,
  STT_FINAL_PATTERN,
  STT_LEGACY_PATTERN,
  STT_PARTIAL_PATTERN,
  VAD_PATTERN,
} from "./channels";
import type { CommitmentManager } from "./commitment/manager";
import type { ConstraintManager } from "./constraint/manager";
import { REDIS_URL, SPECULATIVE_ENABLED } from "./env";
import { createMeetingModeLogger } from "./logger";
import type { MeetingPipelineEngine } from "./pipeline/engine";
import type { SpeakerIdentifier } from "./speaker/identifier";
import type { SpeakerManager } from "./speaker/manager";
import type { SpeakerMapping, VadSignal } from "./speaker/types";
import type { UtteranceFinalizer } from "./utterance/finalizer";

const log = createMeetingModeLogger("subscriber");

let subscriber: Redis | null = null;
let finalizerRef: UtteranceFinalizer | null = null;
let speakerManagerRef: SpeakerManager | null = null;
let commitmentManagerRef: CommitmentManager | null = null;
let constraintManagerRef: ConstraintManager | null = null;
let pipelineEngineRef: MeetingPipelineEngine | null = null;
let _redisClientRef: Redis | null = null;

async function loadIdentifierFromDb(
  client: Redis,
  sessionId: string,
  identifier: SpeakerIdentifier
): Promise<void> {
  const meetingId = await client.hget(
    redisKeys.meetingSession(sessionId),
    "meetingId"
  );
  if (!meetingId) {
    return;
  }
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { speakerMappings: true },
  });
  if (meeting?.speakerMappings) {
    const mappingsObj = meeting.speakerMappings as unknown as Record<
      string,
      SpeakerMapping
    >;
    const map = new Map<number, SpeakerMapping>();
    for (const [idxStr, mapping] of Object.entries(mappingsObj)) {
      map.set(Number(idxStr), mapping);
    }
    identifier.hydrate(map);
    log.info(
      { sessionId, meetingId, count: map.size },
      "Hydrated SpeakerIdentifier from DB"
    );
  }
}

async function getHydratedIdentifier(
  sessionId: string
): Promise<SpeakerIdentifier | null> {
  if (!speakerManagerRef) {
    return null;
  }
  // Fast path without copying the identifier map per STT message (P2.5).
  const existing = speakerManagerRef.getIdentifierIfExists(sessionId);
  if (existing) {
    return existing;
  }

  const identifier = speakerManagerRef.getIdentifier(sessionId);
  try {
    const client = _redisClientRef ?? redis;
    if (client) {
      // 1. Try to load from intermediate session state in Redis first (e.g. across mic switches or network drops)
      const stateKey = redisKeys.meetingSessionState(sessionId);
      const rawState = await client.get(stateKey);
      if (rawState) {
        const stateObj = JSON.parse(rawState) as Record<string, SpeakerMapping>;
        const map = new Map<number, SpeakerMapping>();
        for (const [idxStr, mapping] of Object.entries(stateObj)) {
          map.set(Number(idxStr), mapping);
        }
        identifier.hydrate(map);
        log.info(
          { sessionId, count: map.size },
          "Hydrated SpeakerIdentifier from Redis session state"
        );
        return identifier;
      }

      // 2. Fall back to Prisma DB state
      await loadIdentifierFromDb(client, sessionId, identifier);
    }
  } catch (err) {
    log.error(
      { err, sessionId },
      "Failed to hydrate SpeakerIdentifier from DB"
    );
  }
  return identifier;
}

/**
 * Decide whether a Redis `pmessage` delivery should invoke `handleSttResult`,
 * and in which mode. Redis `*` spans `.` separators, so overlapping patterns
 * can deliver the same message more than once — the concrete channel shape
 * (not the matched pattern alone) determines handling. Exactly one of the
 * two pattern deliveries resolves non-null per message.
 */
export function resolveSttDispatch(
  pattern: string,
  channel: string
): "final" | "partial" | null {
  if (pattern === STT_LEGACY_PATTERN) {
    // `meeting.stt.*` also matches the new shapes; only the true legacy shape
    // (`meeting.stt.<sid>`) is handled here. New shapes resolve via their own
    // patterns, so a new final is never handled twice.
    return isLegacyFinalSttChannel(channel) ? "final" : null;
  }
  if (pattern === STT_FINAL_PATTERN && isFinalSttChannel(channel)) {
    return "final";
  }
  if (pattern === STT_PARTIAL_PATTERN && isPartialSttChannel(channel)) {
    return "partial";
  }
  return null;
}

/**
 * Speculative partial dispatch (P3.2). Resolves the partial's speaker with
 * the same call the final will perform moments later (existing mapping, host
 * short-circuit, or provisional VAD candidate) and feeds the partial to the
 * pipeline engine fire-and-forget — partial handling never waits on the
 * hydration/cost reads inside `evaluatePartial`.
 *
 * Early resolution converges to identical identifier state: mapping `source`
 * is write-only, and the provisional path exists precisely for this
 * partial-then-final sequence. Returns true when a speculation was
 * dispatched. The `enabled` parameter defaults to SPECULATIVE_ENABLED and
 * exists as a test seam.
 */
export function dispatchSpeculativePartial(
  result: SttResult,
  identifier: SpeakerIdentifier,
  pipelineEngine: MeetingPipelineEngine | null,
  enabled: boolean = SPECULATIVE_ENABLED
): boolean {
  if (!(enabled && pipelineEngine)) {
    return false;
  }
  const text = result.transcript?.trim();
  if (!text) {
    return false;
  }
  const speechTimestamp = Number(result.speechTimestamp);
  const speechTs = Number.isFinite(speechTimestamp) ? speechTimestamp : 0;
  const speaker = identifier.identifySpeaker(result.diarizationIndex, speechTs);
  pipelineEngine
    .evaluatePartial({
      confidence: result.confidence,
      sessionId: result.sessionId,
      speaker,
      text,
      timestamp: speechTs,
    })
    .catch((error) => {
      log.warn(
        { err: error, sessionId: result.sessionId },
        "Speculative partial evaluation failed"
      );
    });
  return true;
}

async function handleSttResult(
  channel: string,
  message: string,
  isPartial = false
): Promise<void> {
  try {
    const result = JSON.parse(message) as SttResult;

    if (!(finalizerRef && speakerManagerRef)) {
      log.error("No finalizer or speaker manager registered!");
      return;
    }

    // Register identifier so finalizer can resolve speakers
    const identifier = await getHydratedIdentifier(result.sessionId);
    if (!identifier) {
      return;
    }
    finalizerRef.registerSpeakerIdentifier(result.sessionId, identifier);
    if (isPartial || !result.isFinal) {
      const speechTimestamp = Number(result.speechTimestamp);
      const safeTs = Number.isFinite(speechTimestamp) ? speechTimestamp : 0;
      identifier.processSttPartial(result.diarizationIndex, safeTs);
    }
    if (isPartial) {
      // P3.2: speculative path — fire-and-forget behind SPECULATIVE_ENABLED.
      dispatchSpeculativePartial(result, identifier, pipelineEngineRef);
    }

    await finalizerRef.process(result);
  } catch (error) {
    log.error({ err: error, channel }, "Error handling STT result");
  }
}

async function handleSessionEnd(message: string): Promise<void> {
  try {
    const event = JSON.parse(message) as SessionEndEvent;

    if (speakerManagerRef) {
      try {
        const identifier = await getHydratedIdentifier(event.sessionId);
        if (identifier) {
          const sessionState = identifier.exportSessionState();
          const stateKey = redisKeys.meetingSessionState(event.sessionId);
          const client = _redisClientRef ?? redis;
          if (client && typeof client.set === "function") {
            await client.set(
              stateKey,
              JSON.stringify(sessionState),
              "EX",
              TTL.SESSION_STATE
            );
            log.info(
              { sessionId: event.sessionId },
              "Exported and saved session speaker state to Redis"
            );
          }
        }
      } catch (err) {
        log.error(
          { err, sessionId: event.sessionId },
          "Failed to export session speaker state to Redis"
        );
      }
      speakerManagerRef.removeSession(event.sessionId);
    }

    pipelineEngineRef?.closeSession(event.sessionId);

    const closeResults = await Promise.allSettled(
      [
        commitmentManagerRef?.closeSessionAwaitSnapshots(event.sessionId),
        constraintManagerRef?.closeSessionAwaitSnapshots(event.sessionId),
      ].filter(Boolean) as Promise<void>[]
    );

    if (!finalizerRef) {
      log.error("No finalizer registered!");
      return;
    }

    await finalizerRef.closeSession(event.sessionId);

    for (const result of closeResults) {
      if (result.status === "rejected") {
        log.error(
          { err: result.reason },
          "Ledger close failed during session end"
        );
      }
    }
  } catch (error) {
    log.error({ err: error }, "Error handling session end");
  }
}

async function handleParticipantJoin(message: string): Promise<void> {
  try {
    const event = JSON.parse(message) as {
      sessionId: string;
      userId: string;
      name?: string;
      role?: "host" | "participant";
    };
    if (speakerManagerRef) {
      // Ensure it's hydrated so we don't lose existing state
      await getHydratedIdentifier(event.sessionId);
      const name = event.name || event.userId;
      speakerManagerRef.registerTeamMember(
        event.sessionId,
        event.userId,
        name,
        event.role
      );
    }
    // A new member changes Tier 2 identity-guess candidates: refresh the
    // pipeline's session cache (P2.6). Not awaited — join handling stays
    // fast. refreshSessionMembers never rejects (failures keep the cache).
    pipelineEngineRef?.refreshSessionMembers(event.sessionId);
  } catch (error) {
    log.error({ err: error }, "Error handling participant join");
  }
}

async function handleVadSignal(message: string): Promise<void> {
  if (!(speakerManagerRef && finalizerRef)) {
    return;
  }

  try {
    const signal = JSON.parse(message) as VadSignal;
    // ensure hydrated first
    const identifier = await getHydratedIdentifier(signal.sessionId);
    if (!identifier) {
      return;
    }

    speakerManagerRef.handleVadSignal(signal);
    const ringBuffer = finalizerRef.getRingBuffer(signal.sessionId);

    if (ringBuffer) {
      // Fetch unidentified utterances from the last 2 seconds
      const recentTs = Date.now() - 2000;
      const pendingUtterances = ringBuffer
        .getAll()
        .filter((u) => u.speaker.type === "EXTERNAL" && u.timestamp >= recentTs)
        .map((u) => ({
          diarizationIndex: u.speaker.diarizationIndices[0] ?? 0,
          timestamp: u.timestamp,
        }));

      if (pendingUtterances.length > 0) {
        const newlyIdentified =
          identifier.tryLateIdentification(pendingUtterances);

        for (const { diarizationIndex, speaker } of newlyIdentified) {
          await finalizerRef.processRetroactiveIdentification(
            signal.sessionId,
            diarizationIndex,
            speaker
          );
        }
      }
    }
  } catch (error) {
    log.error({ err: error }, "Error handling VAD signal");
  }
}

async function handleParticipantRoleChange(
  channel: string,
  message: string
): Promise<void> {
  if (!speakerManagerRef) {
    return;
  }

  try {
    const sessionId = extractSessionId(channel);
    if (!sessionId) {
      log.error({ channel }, "Could not extract sessionId from channel");
      return;
    }

    const event = JSON.parse(message) as {
      speakerId: string;
      role: "TEAM" | "EXTERNAL";
    };

    const identifier = await getHydratedIdentifier(sessionId);
    if (identifier) {
      identifier.changeParticipantRole(event.speakerId, event.role);

      const mapping = identifier.getSpeakerMappingBySpeakerId(event.speakerId);
      if (mapping && finalizerRef) {
        await finalizerRef.processRetroactiveRoleChange(
          sessionId,
          event.speakerId,
          mapping.speaker
        );
      }

      try {
        const client = _redisClientRef ?? redis;
        if (client) {
          const meetingId = await client.hget(
            redisKeys.meetingSession(sessionId),
            "meetingId"
          );
          if (meetingId) {
            const exportState = identifier.exportSessionState();
            await prisma.meeting.update({
              where: { id: meetingId },
              data: {
                // biome-ignore lint/suspicious/noExplicitAny: JSON type mapping
                speakerMappings: exportState.speakerMappings as any,
              },
            });
            log.info(
              { meetingId, sessionId },
              "Persisted speakerMappings to DB"
            );
          }
        }
      } catch (dbErr) {
        log.error(
          { err: dbErr, sessionId },
          "Failed to persist speakerMappings to DB"
        );
      }
    }
  } catch (error) {
    log.error(
      { err: error, channel },
      "Error handling participant role change"
    );
  }
}

export async function startSubscriber(
  finalizer: UtteranceFinalizer,
  speakerManager: SpeakerManager,
  redisClient: Redis,
  commitmentManager?: CommitmentManager,
  constraintManager?: ConstraintManager,
  pipelineEngine?: MeetingPipelineEngine
): Promise<void> {
  finalizerRef = finalizer;
  speakerManagerRef = speakerManager;
  commitmentManagerRef = commitmentManager ?? null;
  constraintManagerRef = constraintManager ?? null;
  pipelineEngineRef = pipelineEngine ?? null;
  _redisClientRef = redisClient;

  subscriber = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    showFriendlyErrorStack: true,
  });

  await subscriber.connect();
  log.info("Connected to Redis");

  await subscriber.subscribe(SESSION_END);
  log.info({ channel: SESSION_END }, "Subscribed to session end channel");

  await subscriber.subscribe(PARTICIPANT_JOIN);
  log.info(
    { channel: PARTICIPANT_JOIN },
    "Subscribed to participant join channel"
  );

  await subscriber.psubscribe(STT_FINAL_PATTERN);
  log.info({ pattern: STT_FINAL_PATTERN }, "Pattern subscribed to STT results");
  await subscriber.psubscribe(STT_PARTIAL_PATTERN);
  log.info(
    { pattern: STT_PARTIAL_PATTERN },
    "Pattern subscribed to STT partial results"
  );
  // Mixed-version safety: keep accepting the legacy `meeting.stt.<sid>`
  // finals while older STT/realtime instances may still publish them.
  await subscriber.psubscribe(STT_LEGACY_PATTERN);
  log.info(
    { pattern: STT_LEGACY_PATTERN },
    "Pattern subscribed to legacy STT finals"
  );

  await subscriber.psubscribe(VAD_PATTERN);
  log.info({ pattern: VAD_PATTERN }, "Pattern subscribed to VAD signals");

  await subscriber.psubscribe(PARTICIPANT_ROLE_CHANGE_PATTERN);
  log.info(
    { pattern: PARTICIPANT_ROLE_CHANGE_PATTERN },
    "Pattern subscribed to participant role changes"
  );

  subscriber.on("message", async (channel, message) => {
    if (channel === SESSION_END) {
      await handleSessionEnd(message);
    } else if (channel === PARTICIPANT_JOIN) {
      await handleParticipantJoin(message);
    }
  });

  subscriber.on("pmessage", async (_pattern, channel, message) => {
    try {
      // Guard on the concrete channel, not just the matched pattern: Redis
      // `*` also spans `.` separators, so overlapping patterns can deliver
      // the same message twice. Only the matching shape is processed.
      const sttRoute = resolveSttDispatch(_pattern, channel);
      if (sttRoute) {
        await handleSttResult(channel, message, sttRoute === "partial");
      }
      if (_pattern === VAD_PATTERN) {
        await handleVadSignal(message);
      }
      if (_pattern === PARTICIPANT_ROLE_CHANGE_PATTERN) {
        await handleParticipantRoleChange(channel, message);
      }
    } catch (error) {
      log.error({ err: error, channel }, "Error handling message on pattern");
    }
  });

  subscriber.on("error", (error) => {
    log.error({ err: error }, "Redis error");
  });

  subscriber.on("reconnecting", () => {
    log.warn("Reconnecting to Redis...");
  });
}

export function stopSubscriber(): void {
  if (subscriber) {
    log.info("Stopping...");
    subscriber.disconnect();
    subscriber = null;
    finalizerRef = null;
    speakerManagerRef = null;
    commitmentManagerRef = null;
    constraintManagerRef = null;
    pipelineEngineRef = null;
    _redisClientRef = null;
    log.info("Disconnected");
  }
}
