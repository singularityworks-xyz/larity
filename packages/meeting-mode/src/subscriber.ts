import Redis from "ioredis";
import type { SessionEndEvent, SttResult } from "../../stt/src/types";
import {
  PARTICIPANT_JOIN,
  SESSION_END,
  STT_FINAL_PATTERN,
  STT_PARTIAL_PATTERN,
  VAD_PATTERN,
} from "./channels";
import type { CommitmentManager } from "./commitment/manager";
import type { ConstraintManager } from "./constraint/manager";
import { REDIS_URL } from "./env";
import { createMeetingModeLogger } from "./logger";
import type { MeetingPipelineEngine } from "./pipeline/engine";
import type { SpeakerManager } from "./speaker/manager";
import type { VadSignal } from "./speaker/types";
import type { UtteranceFinalizer } from "./utterance/finalizer";

const log = createMeetingModeLogger("subscriber");

let subscriber: Redis | null = null;
let finalizerRef: UtteranceFinalizer | null = null;
let speakerManagerRef: SpeakerManager | null = null;
let commitmentManagerRef: CommitmentManager | null = null;
let constraintManagerRef: ConstraintManager | null = null;
let pipelineEngineRef: MeetingPipelineEngine | null = null;
let _redisClientRef: Redis | null = null;

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
    const identifier = speakerManagerRef.getIdentifier(result.sessionId);
    finalizerRef.registerSpeakerIdentifier(result.sessionId, identifier);
    if (isPartial || !result.isFinal) {
      identifier.processSttPartial(
        result.diarizationIndex,
        result.speechTimestamp
      );
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

function handleParticipantJoin(message: string): void {
  try {
    const event = JSON.parse(message) as {
      sessionId: string;
      userId: string;
      name?: string;
    };
    if (speakerManagerRef) {
      // In a real system, we'd fetch the user's name from DB or Redis.
      // For now, we just pass the userId as the name if we don't have it.
      const name = event.name || event.userId;
      speakerManagerRef.registerTeamMember(event.sessionId, event.userId, name);
    }
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
    speakerManagerRef.handleVadSignal(signal);

    const identifier = speakerManagerRef.getIdentifier(signal.sessionId);
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
        const newlyIdentified = identifier.tryLateIdentification(
          signal,
          pendingUtterances
        );

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

  await subscriber.psubscribe(VAD_PATTERN);
  log.info({ pattern: VAD_PATTERN }, "Pattern subscribed to VAD signals");

  subscriber.on("message", async (channel, message) => {
    if (channel === SESSION_END) {
      await handleSessionEnd(message);
    } else if (channel === PARTICIPANT_JOIN) {
      await handleParticipantJoin(message);
    }
  });

  subscriber.on("pmessage", async (_pattern, channel, message) => {
    try {
      if (_pattern === STT_FINAL_PATTERN) {
        await handleSttResult(channel, message, false);
      }
      if (_pattern === STT_PARTIAL_PATTERN) {
        await handleSttResult(channel, message, true);
      }
      if (_pattern === VAD_PATTERN) {
        await handleVadSignal(message);
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
