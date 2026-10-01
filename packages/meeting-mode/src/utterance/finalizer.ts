import type { SttResult } from "../../../stt/src/types";
import { topicChannel, utteranceChannel } from "../channels";
import { MERGE_GROUPING_MS, MERGE_PUBLISH_GAP_MS } from "../env";
import { createMeetingModeLogger } from "../logger";
import { recordHistogram } from "../pipeline/metrics";
import type { Tier2TopicDelta } from "../pipeline/types";
import type { SpeakerIdentifier } from "../speaker/identifier";
import { calculateTextSimilarity } from "../speaker/offline-correlation";
import { GoogleGenAIEmbedder } from "../topic/embedder";
import {
  TopicManager,
  type TopicManagerOptions,
  type TopicPublisher,
} from "../topic/manager";
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
  hset(key: string, field: string, value: string): Promise<number>;
  publish(channel: string, message: string): Promise<number>;
}

type UtteranceEmbedder = Pick<GoogleGenAIEmbedder, "embed">;
type UtteranceTopicManager = Pick<
  TopicManager,
  "applyTier2TopicDelta" | "assignTopic" | "closeSession" | "getTopics"
>;

export type RetroactiveUpdateHandler = (
  utterance: Utterance,
  oldSpeakerType: string
) => Promise<void>;

/** Why an utterance is (re)published. Absent for first-time publishes. */
export interface UtterancePublishOptions {
  republish?: "reidentified" | "role_change";
}

export type UtterancePublishedHandler = (
  utterance: Utterance,
  options?: UtterancePublishOptions
) => Promise<void>;

export class UtteranceFinalizer {
  private readonly mergerGroupingMs: number;
  private readonly mergerPublishGapMs: number;
  private readonly mergers = new Map<string, UtteranceMerger>();
  private readonly sequences = new Map<string, number>();
  private readonly publisher: UtterancePublisher;
  private readonly ringBuffers = new Map<string, RingBuffer>();
  private readonly speakerIdentifiers = new Map<string, SpeakerIdentifier>();
  private readonly retroactiveHandlers: RetroactiveUpdateHandler[] = [];
  private readonly publishedHandlers: UtterancePublishedHandler[] = [];
  private readonly topicManager: UtteranceTopicManager;
  private readonly embedder: UtteranceEmbedder;
  private readonly mergerFlushTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();

  /** In-flight `onUtterancePublished` handlers per session (drained on close). */
  private readonly publishedHandlerInflight = new Map<
    string,
    Set<Promise<unknown>>
  >();

  /**
   * Per-session FIFO around `processFinal` (same pattern as the pipeline
   * engine's `evaluationChains`). `processFinal` awaits the embedding +
   * topic assignment, so without serialization two rapid finals can
   * interleave at the await and hit `merger.push` / publish out of order.
   */
  private readonly processChains = new Map<string, Promise<unknown>>();

  /**
   * Publish-path timing anchors per utteranceId (`${sessionId}:${seq}`).
   * Set in `processFinal`, consumed (and deleted) in `publishUtterance`.
   * Entries for ids consumed by a same-speaker merge are deleted at push
   * time since the merged utterance retains the previous id.
   */
  private readonly publishTrack = new Map<
    string,
    { finalizeStartPerf: number; sttTs: number }
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
      dependencies?: {
        embedder?: UtteranceEmbedder;
        topicManager?: UtteranceTopicManager;
      };
    } = {}
  ) {
    this.publisher = publisher;
    const legacyBoth = options.mergerGapMs;
    this.mergerGroupingMs =
      options.mergerGroupingMs ?? legacyBoth ?? MERGE_GROUPING_MS;
    this.mergerPublishGapMs =
      options.mergerPublishGapMs ?? legacyBoth ?? MERGE_PUBLISH_GAP_MS;
    this.topicManager =
      options.dependencies?.topicManager ??
      new TopicManager(publisher, options.topicManager);
    this.embedder = options.dependencies?.embedder ?? new GoogleGenAIEmbedder();
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

      await this.publishUtterance(utterance, { republish: "reidentified" });

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

      await this.publishUtterance(utterance, { republish: "role_change" });

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

    // P2.12: partials are intentionally not accumulated. The old
    // PartialBuffer only ever fed getStats() (no callers) while costing an
    // append + overflow splice per interim; provisional speaker mapping
    // happens in the identifier, not here.
    if (!isFinal) {
      return;
    }

    const previous = this.processChains.get(sessionId) ?? Promise.resolve();
    const next = previous.then(() => this.processFinal(sessionId, result));
    const recovered = next.catch((error: unknown) => {
      log.error(
        { err: error, sessionId },
        "Queued finalize failed — chain continues"
      );
    });
    this.processChains.set(sessionId, recovered);
    await recovered;
  }

  private async processFinal(
    sessionId: string,
    result: SttResult
  ): Promise<void> {
    this.clearMergerFlushTimer(sessionId);

    // P2.12: finalized fields come straight from the STT final — the removed
    // PartialBuffer never contributed anything beyond this mapping.
    const finalized = {
      text: result.transcript,
      confidence: result.confidence,
      duration: result.duration,
      startOffset: result.start,
      timestamp: result.ts,
    };
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

    const _embedWallStart = PERF.now();
    const embedOutcome = this.embedder.embed(utterance.text);
    // Tap (don't alter) the in-flight embedding to time it. Both branches
    // handle the outcome, so no unhandled rejection is introduced.
    embedOutcome.then(
      () =>
        recordHistogram(
          "finalizer.embed_wait_ms",
          PERF.now() - _embedWallStart
        ),
      () =>
        recordHistogram("finalizer.embed_wait_ms", PERF.now() - _embedWallStart)
    );
    utterance.embeddingPromise = embedOutcome.catch((error): undefined => {
      log.warn(
        { err: error, utteranceId: utterance.utteranceId },
        "Failed to generate embedding for utterance"
      );
      return;
    });

    // Anchor publish-path timing before the utterance can be held by the merger.
    this.publishTrack.set(utterance.utteranceId, {
      finalizeStartPerf: finalizeStart,
      sttTs: result.ts,
    });

    // P2.1: push to the merger and publish BEFORE topic assignment — the
    // transcript must not wait on the embedding round trip.
    const merger = this.getOrCreateMerger(sessionId);
    const toPublish = merger.push(utterance);

    if (toPublish) {
      await this.publishUtterance(toPublish);
    }

    // If the merger consumed this utterance into a same-speaker merge, its
    // id is gone: drop its timing anchor and skip its topic delta (the
    // surviving utterance keeps its own topic; the client never saw this id).
    const pendingAfterPush = merger.peekPending();
    const mergedAway =
      !toPublish &&
      !!pendingAfterPush &&
      pendingAfterPush.utteranceId !== utterance.utteranceId;
    if (mergedAway) {
      this.publishTrack.delete(utterance.utteranceId);
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

    // Assign topic after publish (awaited: keeps per-session ordering and
    // topic-centroid updates serialized). Already-rendered rows catch up via
    // the topic delta below; Tier 2/3 await the embedding independently.
    const topicId = await this.topicManager.assignTopic(utterance);
    utterance.topicId = topicId;
    utterance.embeddingPromise = undefined;

    if (!mergedAway) {
      await this.publishTopicDelta(sessionId, utterance.utteranceId, topicId);
    }
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
      return;
    }

    const topic = this.topicManager
      .getTopics(sessionId)
      .find((candidate) => candidate.topicId === topicId);

    return topic?.label;
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info({ sessionId }, "Closing session");

    this.clearMergerFlushTimer(sessionId);

    // Drain any in-flight finalize first so the flush below can't race it
    // at merger.push / publish.
    const inflight = this.processChains.get(sessionId);
    if (inflight) {
      await inflight;
    }
    this.processChains.delete(sessionId);

    const merger = this.mergers.get(sessionId);
    if (merger) {
      const pending = merger.flush();
      if (pending) {
        await this.publishUtterance(pending);
      }
    }

    await this.awaitPublishedHandlersForSession(sessionId);

    this.mergers.delete(sessionId);
    this.sequences.delete(sessionId);
    this.ringBuffers.delete(sessionId);
    for (const utteranceId of this.publishTrack.keys()) {
      if (utteranceId.startsWith(`${sessionId}:`)) {
        this.publishTrack.delete(utteranceId);
      }
    }

    await this.topicManager.closeSession(sessionId);
  }

  async closeAll(): Promise<void> {
    log.info({ count: this.mergers.size }, "Closing all sessions");

    const sessionIds = [...this.mergers.keys()];

    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    log.info({ closedCount: sessionIds.length }, "All sessions closed");
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

  /**
   * Emit `{ type: "utterance_topic", utteranceId, topicId }` on the topic
   * channel so clients that already rendered the utterance (published
   * before topic assignment) can patch its topic. Full topic state
   * continues on the same channel unchanged.
   */
  private async publishTopicDelta(
    sessionId: string,
    utteranceId: string,
    topicId: string
  ): Promise<void> {
    try {
      await this.publisher.publish(
        topicChannel(sessionId),
        JSON.stringify({ type: "utterance_topic", utteranceId, topicId })
      );
    } catch (error) {
      log.error(
        { err: error, sessionId, utteranceId },
        "Failed to publish utterance topic delta"
      );
    }
  }

  private async publishUtterance(
    utterance: Utterance,
    options?: UtterancePublishOptions
  ): Promise<void> {
    const channel = utteranceChannel(utterance.sessionId);
    const message = JSON.stringify(utterance, (key, value) =>
      key === "embeddingPromise" ? undefined : value
    );

    // Consume the publish-path timing anchor (set in processFinal).
    // Republishes (retroactive re-identification, session flush) find no
    // anchor and are not recorded — only the first publish counts.
    const track = this.publishTrack.get(utterance.utteranceId);
    if (track) {
      this.publishTrack.delete(utterance.utteranceId);
      recordHistogram(
        "finalizer.merger_hold_ms",
        PERF.now() - track.finalizeStartPerf
      );
      if (Number.isFinite(track.sttTs) && track.sttTs > 0) {
        recordHistogram(
          "finalizer.stt_final_to_publish_ms",
          Date.now() - track.sttTs
        );
      }
    }

    try {
      await this.publisher.publish(channel, message);

      for (const handler of this.publishedHandlers) {
        const inflight = Promise.resolve(handler(utterance, options)).catch(
          (error) => {
            log.error(
              { err: error, utteranceId: utterance.utteranceId },
              "Utterance published handler failed"
            );
          }
        );
        this.trackPublishedHandler(utterance.sessionId, inflight);
      }

      log.info(
        {
          sessionId: utterance.sessionId,
          utteranceId: utterance.utteranceId,
          topicId: utterance.topicId,
          textPrefix: utterance.text.slice(0, 50),
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
