import type { SttResult } from "../../../stt/src/types";
import { utteranceChannel } from "../channels";
import { MERGE_GROUPING_MS, MERGE_PUBLISH_GAP_MS } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Tier2TopicDelta } from "../pipeline/types";
import type { SpeakerIdentifier } from "../speaker/identifier";
import { calculateTextSimilarity } from "../speaker/offline-correlation";
import { GoogleGenAIEmbedder } from "../topic/embedder";
import {
  TopicManager,
  type TopicManagerOptions,
  type TopicPublisher,
} from "../topic/manager";
import { PartialBuffer } from "./buffer";
import { UtteranceMerger } from "./merger";
import { RingBuffer } from "./ring-buffer";
import { createUnidentifiedSpeaker, type Utterance } from "./types";

const log = createMeetingModeLogger("utterance-finalizer");

const PERF = {
  now: () => performance.now(),
};

/**
 * Maximum age difference (ms) between an incoming mic-channel utterance and a
 * recently published system-channel utterance for the two to be considered
 * potential acoustic-echo candidates. The window is wider here than in offline
 * processing because live utterances carry additional pipeline latency on top
 * of the acoustic delay (STT streaming, merger flush, publish round-trip).
 */
const LIVE_ECHO_TIME_WINDOW_MS = 4000;

/**
 * Minimum bigram-Jaccard similarity between a mic utterance and a system
 * utterance for the mic utterance to be classified as an acoustic echo and
 * discarded. Mirrors the offline threshold; see ECHO_SIMILARITY_THRESHOLD in
 * offline-correlation.ts for the full rationale.
 */
const LIVE_ECHO_SIMILARITY_THRESHOLD = 0.4;

export interface UtterancePublisher extends TopicPublisher {
  publish(channel: string, message: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
}

export type RetroactiveUpdateHandler = (
  utterance: Utterance,
  oldSpeakerType: string
) => Promise<void>;

export type UtterancePublishedHandler = (utterance: Utterance) => Promise<void>;

export class UtteranceFinalizer {
  private readonly mergerGroupingMs: number;
  private readonly mergerPublishGapMs: number;
  private readonly buffer = new Map<string, PartialBuffer>();
  private readonly mergers = new Map<string, UtteranceMerger>();
  private readonly sequences = new Map<string, number>();
  private readonly publisher: UtterancePublisher;
  private readonly ringBuffers = new Map<string, RingBuffer>();
  private readonly speakerIdentifiers = new Map<string, SpeakerIdentifier>();
  private readonly retroactiveHandlers: RetroactiveUpdateHandler[] = [];
  private readonly publishedHandlers: UtterancePublishedHandler[] = [];
  private readonly topicManager: TopicManager;
  private readonly embedder: GoogleGenAIEmbedder;
  private readonly mergerFlushTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  /** In-flight `onUtterancePublished` handlers per session (drained on close). */
  private readonly publishedHandlerInflight = new Map<
    string,
    Set<Promise<unknown>>
  >();

  constructor(
    publisher: UtterancePublisher,
    options: {
      topicManager?: TopicManagerOptions;
      /** Same-speaker merge window (ms between segment ends). */
      mergerGroupingMs?: number;
      /** Flush pending publish after audio end + this gap (ms). */
      mergerPublishGapMs?: number;
      /**
       * @deprecated Sets both grouping and publish gap when the split env vars are unused.
       */
      mergerGapMs?: number;
    } = {}
  ) {
    this.publisher = publisher;
    const legacyBoth = options.mergerGapMs;
    this.mergerGroupingMs =
      options.mergerGroupingMs ?? legacyBoth ?? MERGE_GROUPING_MS;
    this.mergerPublishGapMs =
      options.mergerPublishGapMs ?? legacyBoth ?? MERGE_PUBLISH_GAP_MS;
    this.topicManager = new TopicManager(publisher, options.topicManager);
    this.embedder = new GoogleGenAIEmbedder();
  }

  registerSpeakerIdentifier(
    sessionId: string,
    identifier: SpeakerIdentifier
  ): void {
    this.speakerIdentifiers.set(sessionId, identifier);
  }

  onRetroactiveUpdate(handler: RetroactiveUpdateHandler): void {
    this.retroactiveHandlers.push(handler);
  }

  onUtterancePublished(handler: UtterancePublishedHandler): void {
    this.publishedHandlers.push(handler);
  }

  async processRetroactiveIdentification(
    sessionId: string,
    diarizationIndex: number,
    newSpeaker: Utterance["speaker"]
  ): Promise<void> {
    const ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      return;
    }

    const utterances = ringBuffer.getBySpeakerId(`spk_${diarizationIndex}`);

    for (const utterance of utterances) {
      const oldType = utterance.speaker.type;
      if (
        utterance.speaker.type === newSpeaker.type &&
        utterance.speaker.userId === newSpeaker.userId
      ) {
        continue;
      }

      utterance.speaker = newSpeaker;

      await this.publishUtterance(utterance);

      for (const handler of this.retroactiveHandlers) {
        await handler(utterance, oldType);
      }

      log.info(
        {
          sessionId,
          utteranceId: utterance.utteranceId,
          diarizationIndex,
          newType: newSpeaker.type,
          oldType,
        },
        "Retroactive speaker identification applied"
      );
    }
  }

  async processRetroactiveRoleChange(
    sessionId: string,
    speakerId: string,
    newSpeaker: Utterance["speaker"]
  ): Promise<void> {
    const ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      return;
    }

    const utterances = ringBuffer.getBySpeakerId(speakerId);

    for (const utterance of utterances) {
      const oldType = utterance.speaker.type;
      if (
        utterance.speaker.type === newSpeaker.type &&
        utterance.speaker.userId === newSpeaker.userId
      ) {
        continue;
      }

      utterance.speaker = { ...newSpeaker };

      await this.publishUtterance(utterance);

      for (const handler of this.retroactiveHandlers) {
        await handler(utterance, oldType);
      }

      log.info(
        {
          sessionId,
          utteranceId: utterance.utteranceId,
          speakerId,
          newType: newSpeaker.type,
          oldType,
        },
        "Retroactive manual role change applied"
      );
    }
  }

  async process(result: SttResult): Promise<void> {
    const { sessionId, isFinal } = result;

    const buffer = this.getOrCreateBuffer(sessionId);

    if (!isFinal) {
      buffer.append(result);
      return;
    }

    await this.processFinal(sessionId, result, buffer);
  }

  private async processFinal(
    sessionId: string,
    result: SttResult,
    buffer: PartialBuffer
  ): Promise<void> {
    this.clearMergerFlushTimer(sessionId);

    const finalized = buffer.finalize(result);
    if (!finalized.text.trim()) {
      return;
    }

    const normalizedText = normalizePunctuation(finalized.text);

    const wordCount = countWords(normalizedText);

    const finalizeStart = PERF.now();

    const speaker = this.resolveSpeaker(
      sessionId,
      result.diarizationIndex,
      result.speechTimestamp
    );

    if (speaker.isHost && result.diarizationIndex >= 1000) {
      log.info(
        {
          sessionId,
          diarizationIndex: result.diarizationIndex,
          speakerId: speaker.speakerId,
          userId: speaker.userId,
        },
        "Discarding dual-channel host-echo utterance from sys channel"
      );
      return;
    }

    if (result.diarizationIndex < 1000) {
      const ringBuffer = this.ringBuffers.get(sessionId);
      if (ringBuffer) {
        const recent = ringBuffer.getRecent(10);
        const isEcho = recent.some((u) => {
          const isSystem = u.speaker.diarizationIndices.some(
            (idx) => idx >= 1000
          );
          if (!isSystem) {
            return false;
          }
          const timeDiff = Math.abs(result.speechTimestamp - u.timestamp);
          if (timeDiff > LIVE_ECHO_TIME_WINDOW_MS) {
            return false;
          }
          const sim = calculateTextSimilarity(normalizedText, u.text);
          return sim >= LIVE_ECHO_SIMILARITY_THRESHOLD;
        });

        if (isEcho) {
          log.info(
            {
              sessionId,
              diarizationIndex: result.diarizationIndex,
              text: normalizedText,
            },
            "Discarding client-to-mic echo utterance"
          );
          return;
        }
      }
    }

    const utterance: Utterance = {
      utteranceId: this.generateUtteranceId(sessionId),
      sessionId,
      speaker,
      text: normalizedText,
      timestamp: result.speechTimestamp,
      confidenceScore: finalized.confidence,
      startOffset: finalized.startOffset,
      duration: finalized.duration,
      wordCount,
      mergedCount: 1,
    };

    const embedWallStart = PERF.now();
    utterance.embeddingPromise = this.embedder
      .embed(utterance.text)
      .catch((error) => {
        log.warn(
          { err: error, utteranceId: utterance.utteranceId },
          "Failed to generate embedding for utterance"
        );
        return undefined;
      });

    // Assign topic (awaits in-flight embedding via TopicManager)
    const topicId = await this.topicManager.assignTopic(utterance);
    utterance.topicId = topicId;

    utterance.embeddingPromise = undefined;

    const merger = this.getOrCreateMerger(sessionId);
    const toPublish = merger.push(utterance);

    if (toPublish) {
      await this.publishUtterance(toPublish, finalizeStart);
    }

    if (merger.hasPending()) {
      this.scheduleMergerGapFlush(sessionId);
    }

    let ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      ringBuffer = new RingBuffer({ maxSize: 100, maxAgeMs: 120_000 });
      this.ringBuffers.set(sessionId, ringBuffer);
    }
    ringBuffer.push(utterance);
  }

  getRingBuffer(sessionId: string): RingBuffer | undefined {
    return this.ringBuffers.get(sessionId);
  }

  getRecentSameSpeakerText(
    sessionId: string,
    speakerId: string,
    currentUtteranceId?: string,
    limit = 3
  ): string[] {
    const ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      return [];
    }

    const sameSpeakerUtterances = ringBuffer
      .getBySpeakerId(speakerId)
      .filter((utterance) => utterance.utteranceId !== currentUtteranceId)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, limit)
      .reverse();

    return sameSpeakerUtterances.map((utterance) => utterance.text);
  }

  getRecentEmbeddings(sessionId: string, limit = 10): number[][] {
    const ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      return [];
    }

    const recent = ringBuffer.getRecent(limit);
    return Array.from(recent)
      .map((u) => u.embedding)
      .filter((e): e is number[] => Array.isArray(e) && e.length > 0)
      .reverse();
  }

  /**
   * Utterances before the latest finalize (excluding optional id), chronological order (oldest first).
   * Used for Tier 4 recent transcript context — current utterance is not yet appended when handlers run.
   */
  getRecentUtterancesChronological(
    sessionId: string,
    options?: { excludeUtteranceId?: string; limit?: number }
  ): Utterance[] {
    const ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      return [];
    }

    const excludeId = options?.excludeUtteranceId;
    const limitOut = Math.min(Math.max(options?.limit ?? 48, 1), 120);

    const stats = ringBuffer.getStats();
    const fetch = Math.min(Math.max(stats.count, 1), 120);

    let recentNewestFirst = ringBuffer.getRecent(fetch);
    if (excludeId) {
      recentNewestFirst = recentNewestFirst.filter(
        (utterance) => utterance.utteranceId !== excludeId
      );
    }

    const ascending = [...recentNewestFirst].sort(
      (first, second) => first.timestamp - second.timestamp
    );

    return ascending.slice(Math.max(0, ascending.length - limitOut));
  }

  async applyTier2TopicDelta(
    sessionId: string,
    topicId: string | undefined,
    delta: Tier2TopicDelta
  ): Promise<void> {
    if (!topicId) {
      return;
    }

    await this.topicManager.applyTier2TopicDelta(sessionId, topicId, delta);
  }

  getTopicLabel(
    sessionId: string,
    topicId: string | undefined
  ): string | undefined {
    if (!topicId) {
      return undefined;
    }

    const topic = this.topicManager
      .getTopics(sessionId)
      .find((candidate) => candidate.topicId === topicId);

    return topic?.label;
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info({ sessionId }, "Closing session");

    this.clearMergerFlushTimer(sessionId);

    const merger = this.mergers.get(sessionId);
    if (merger) {
      const pending = merger.flush();
      if (pending) {
        await this.publishUtterance(pending);
      }
    }

    await this.awaitPublishedHandlersForSession(sessionId);

    this.buffer.delete(sessionId);
    this.mergers.delete(sessionId);
    this.sequences.delete(sessionId);
    this.ringBuffers.delete(sessionId);

    await this.topicManager.closeSession(sessionId);
  }

  async closeAll(): Promise<void> {
    log.info({ count: this.buffer.size }, "Closing all sessions");

    const sessionIds = [...this.buffer.keys()];

    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    log.info({ closedCount: sessionIds.length }, "All sessions closed");
  }

  private getOrCreateBuffer(sessionId: string): PartialBuffer {
    let buffer = this.buffer.get(sessionId);
    if (!buffer) {
      buffer = new PartialBuffer();
      this.buffer.set(sessionId, buffer);
    }
    return buffer;
  }

  private getOrCreateMerger(sessionId: string): UtteranceMerger {
    let merger = this.mergers.get(sessionId);
    if (!merger) {
      merger = new UtteranceMerger(this.mergerGroupingMs);
      this.mergers.set(sessionId, merger);
    }
    return merger;
  }

  private clearMergerFlushTimer(sessionId: string): void {
    const handle = this.mergerFlushTimers.get(sessionId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.mergerFlushTimers.delete(sessionId);
    }
  }

  /**
   * When the merger holds a line waiting for a possible same-speaker sibling, still publish
   * past the pending audio end plus `mergerPublishGapMs` if no new final arrives — otherwise
   * pipeline and alerts lag one utterance behind realtime speech.
   */
  private scheduleMergerGapFlush(sessionId: string): void {
    const merger = this.mergers.get(sessionId);
    const pending = merger?.peekPending();
    if (!pending) {
      return;
    }

    const pendingEndMs = pending.timestamp + pending.duration * 1000;
    const fireAt = pendingEndMs + this.mergerPublishGapMs;
    const delayMs = Math.max(0, Math.ceil(fireAt - Date.now()));

    this.clearMergerFlushTimer(sessionId);

    const handle = setTimeout(() => {
      this.mergerFlushTimers.delete(sessionId);
      this.flushMergerPendingAfterGap(sessionId).catch((error) => {
        log.error({ err: error, sessionId }, "Merger gap flush failed");
      });
    }, delayMs);

    this.mergerFlushTimers.set(sessionId, handle);
  }

  private async flushMergerPendingAfterGap(sessionId: string): Promise<void> {
    const merger = this.mergers.get(sessionId);
    if (!merger?.hasPending()) {
      return;
    }

    const flushed = merger.flush();
    if (flushed) {
      await this.publishUtterance(flushed);
    }
  }

  private generateUtteranceId(sessionId: string): string {
    const sequence = this.sequences.get(sessionId) || 0;
    this.sequences.set(sessionId, sequence + 1);
    return `${sessionId}:${sequence}`;
  }

  private resolveSpeaker(
    sessionId: string,
    diarizationIndex: number,
    timestamp: number
  ): Utterance["speaker"] {
    const identifier = this.speakerIdentifiers.get(sessionId);
    if (identifier) {
      return identifier.identifySpeakerForFinal(diarizationIndex, timestamp);
    }
    return createUnidentifiedSpeaker(diarizationIndex);
  }

  private trackPublishedHandler(
    sessionId: string,
    promise: Promise<unknown>
  ): void {
    let bucket = this.publishedHandlerInflight.get(sessionId);
    if (!bucket) {
      bucket = new Set();
      this.publishedHandlerInflight.set(sessionId, bucket);
    }
    bucket.add(promise);
    promise.finally(() => {
      bucket?.delete(promise);
      if (bucket && bucket.size === 0) {
        this.publishedHandlerInflight.delete(sessionId);
      }
    });
  }

  private async awaitPublishedHandlersForSession(
    sessionId: string
  ): Promise<void> {
    const bucket = this.publishedHandlerInflight.get(sessionId);
    if (!bucket || bucket.size === 0) {
      return;
    }
    await Promise.allSettled([...bucket]);
  }

  private async publishUtterance(
    utterance: Utterance,
    finalizeStartMs?: number
  ): Promise<void> {
    const channel = utteranceChannel(utterance.sessionId);
    const message = JSON.stringify(utterance, (key, value) =>
      key === "embeddingPromise" ? undefined : value
    );

    try {
      await this.publisher.publish(channel, message);

      for (const handler of this.publishedHandlers) {
        const inflight = Promise.resolve(handler(utterance)).catch((error) => {
          log.error(
            { err: error, utteranceId: utterance.utteranceId },
            "Utterance published handler failed"
          );
        });
        this.trackPublishedHandler(utterance.sessionId, inflight);
      }

      log.info(
        {
          sessionId: utterance.sessionId,
          utteranceId: utterance.utteranceId,
          topicId: utterance.topicId,
          textPrefix: utterance.text.substring(0, 50),
        },
        "Published utterance"
      );
    } catch (error) {
      log.error(
        { err: error, utteranceId: utterance.utteranceId },
        "Failed to publish utterance"
      );
    }
  }

  getStats(): { sessionCount: number; totalBufferedPartials: number } {
    let totalBufferedPartials = 0;
    for (const buffer of this.buffer.values()) {
      totalBufferedPartials += buffer.getPartialCount();
    }
    return {
      sessionCount: this.buffer.size,
      totalBufferedPartials,
    };
  }
}

const REPEATED_PUNCTUATION = /([.!?]){2,}/g;
const ENDS_WITH_PUNCTUATION = /[.!?]$/;
const WHITESPACE = /\s+/;

function normalizePunctuation(text: string): string {
  let cleaned = text.trim();

  if (cleaned.length === 0) {
    return "";
  }

  cleaned = cleaned.replace(/\s+/g, " ");

  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  cleaned = cleaned.replace(REPEATED_PUNCTUATION, "$1");

  if (!ENDS_WITH_PUNCTUATION.test(cleaned)) {
    cleaned += ".";
  }

  return cleaned;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(WHITESPACE)
    .filter((word) => word.length > 0).length;
}
