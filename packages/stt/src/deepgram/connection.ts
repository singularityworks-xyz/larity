/**
 * deepgram/connection.ts — Deepgram Live Connection
 *
 * Manages a live transcription connection for a single session.
 * Uses lazy connection - only connects when first audio arrives.
 * Handles transcript events and publishes to Redis.
 */

import { publishSystemEvent, redis } from "@larity/db/redis";
import {
  DEEPGRAM_DIARIZE_MIC,
  DEEPGRAM_ENDPOINTING_MS,
  DEEPGRAM_NO_DELAY,
  DEEPGRAM_UTTERANCE_END_MS,
} from "../env";
import { createSttLogger } from "../logger";
import { incrementCounter, recordHistogram } from "../metrics";
import type { SttResult } from "../types";
import { partialChannel, transcriptChannel } from "./channels";
import { getDeepgramClient } from "./client";
import {
  DEFAULT_DG_CONFIG,
  type DeepgramWord,
  type TranscriptAlternative,
  type TranscriptResult,
} from "./types";

/** Minimal handle for a v5 Listen V1 WebSocket connection. */
interface LiveConnection {
  close(): void;
  connect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  sendKeepAlive(message: { type: string }): void;
  sendMedia(message: ArrayBuffer | Blob | ArrayBufferView): void;
  waitForOpen(): Promise<unknown>;
}

/** Idle interval between Deepgram KeepAlive frames (P5.6). */
export const DEEPGRAM_KEEP_ALIVE_INTERVAL_MS = 5000;

/**
 * Pure idle check for the KeepAlive tick (P5.6): connected, and no audio
 * sent for at least one interval. Unit-tested; the method below performs
 * the send.
 */
export function shouldSendKeepAlive(
  connected: boolean,
  lastAudioSendMs: number,
  nowMs: number
): boolean {
  return (
    connected && nowMs - lastAudioSendMs >= DEEPGRAM_KEEP_ALIVE_INTERVAL_MS
  );
}

const log = createSttLogger("dg-connection");

/**
 * Sleep utility for reconnection delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Unique Deepgram diarization labels on this segment (from word-level `speaker`). */
function summarizeDiarizedSpeakers(words: DeepgramWord[] | undefined): string {
  if (!words?.length) {
    return "";
  }
  const seen = new Set<number>();
  for (const w of words) {
    if (typeof w.speaker === "number") {
      seen.add(w.speaker);
    }
  }
  if (seen.size === 0) {
    return "";
  }
  return [...seen].sort((a, b) => a - b).join(",");
}

/**
 * DeepgramConnection manages a live transcription session.
 *
 * Responsibilities:
 * - Open/close Deepgram WebSocket connection (lazy on first audio)
 * - Send mono linear16 PCM buffers (tag/strip handled upstream in dual-channel session)
 * - Handle transcript events → publish to Redis
 * - Implement exponential backoff reconnection
 * - Stamp logical channel (mic vs sys) on published SttResult
 */
export class DeepgramConnection {
  private connection: LiveConnection | null = null;
  private readonly sessionId: string;
  /** Logical capture channel: 0 = host mic, 1 = system / loopback (stamped on SttResult.channel). */
  private readonly logicalChannel: number;
  private isConnected = false;
  private isConnecting = false;
  private isClosed = false;
  private connectionStartTime = 0;
  private connectStartMs = 0;
  private streamStartServerTs = 0;

  /**
   * Per-socket-generation speech-time anchor bookkeeping.
   *
   * Deepgram `start` offsets are relative to the first audio byte received
   * on the CURRENT socket — they reset on every reconnect. The anchor must
   * therefore be re-derived per generation from server-side send/queue
   * timing (all in one clock, so no client clock-skew is involved):
   * - `genFirstEnqueueMs`: server time the first frame of the current
   *   unsent head was received (0 = none yet). Survives across `open`
   *   because dead-window frames belong to the new generation.
   * - `droppedBytesTotal`: every PCM byte dropped (queue cap) on this
   *   connection object, never reset. Feeds the stream-start path for the
   *   whole first generation (after a rebase the socket snapshot wins, so
   *   the running total is harmless there).
   * - Generation head (`genFirstEnqueueMs` + `droppedBytesCurrentGen`):
   *   describes the current unsent head; both reset whenever the queue
   *   fully drains. At the first sendMedia of a generation they are
   *   snapshotted into `genAnchorMs` (`first enqueue + dropped head
   *   duration − transit`) and the socket-local snapshot wins after any
   *   re-open (`anchorRebased`), when the client-derived stream anchor
   *   no longer applies.
   * - `transitEstimateMs`: one-way client→server transit captured once from
   *   the first generation (first enqueue minus stream start, clamped).
   */
  private genFirstEnqueueMs = 0;
  private droppedBytesCurrentGen = 0;
  private droppedBytesTotal = 0;
  private genAnchorMs = 0;
  private anchorRebased = false;
  private hasOpened = false;
  private transitEstimateMs = 0;
  private transitCaptured = false;

  // Accumulation state for stitching intermediate is_final=true segments
  // until speech_final=true signals the end of the utterance.
  // See: https://developers.deepgram.com/docs/understand-endpointing-interim-results
  private accumulatedText = "";
  private accumulatedConfidence = 0;
  private accumulatedSegmentCount = 0;
  private accumulatedStart = 0;
  private accumulatedEnd = 0;
  private accumulatedDiarizationIndex = -1;

  // Reconnection state
  private retryCount = 0;
  private readonly maxRetries = 5;

  /**
   * KeepAlive bookkeeping (P5.6). `lastAudioSendMs` stamps every socket
   * send; the interval (started on first open, stopped on permanent close)
   * sends `{ type: "KeepAlive" }` whenever a full interval passes with no
   * audio — preventing Deepgram's 1011 idle close once the client VAD-gates
   * upstream audio in the future.
   */
  private lastAudioSendMs = 0;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly baseDelay = 100; // ms

  /**
   * Pre-connect ring queue: frames arriving before the socket opens are
   * held here (FIFO) instead of dropped. Cap 64 frames ≈ 2 s per channel;
   * beyond that the oldest frame is dropped and counted.
   */
  private readonly pendingFrames: Buffer[] = [];
  private static readonly MAX_PENDING_FRAMES = 64;

  /**
   * Monotonic generation of the live socket. Incremented every time the
   * current socket is abandoned (reconnect). Event handlers capture the
   * generation of their socket and ignore events from stale generations —
   * without this, an orphaned socket (e.g. one the SDK auto-reconnected
   * before P1.3, or events already in flight) can flip `isConnected` /
   * `isConnecting` under the live connection and corrupt relay state.
   */
  private connectionGeneration = 0;

  constructor(sessionId: string, logicalChannel = 0) {
    this.sessionId = sessionId;
    this.logicalChannel = logicalChannel;
  }

  /**
   * Eagerly open the socket (fire-and-forget). Called when the session is
   * created so the TLS+WebSocket handshake overlaps the client's first
   * audio instead of serializing after it. Safe to call any number of
   * times; lazy connect in sendAudio remains as the fallback path.
   */
  preconnect(): void {
    if (this.isClosed || this.isConnected || this.isConnecting) {
      return;
    }
    log.info(`Eagerly connecting Deepgram for ${this.sessionId}`);
    this.connect().catch((error: unknown) => {
      // connect() routes failures into reconnect() itself; this only guards
      // against unexpected rejections escaping the chain.
      log.error(error as Error, `Preconnect failed for ${this.sessionId}`);
    });
  }

  /**
   * Connect to Deepgram (called lazily on first audio)
   */
  private async connect(): Promise<void> {
    if (this.isClosed || this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;
    this.connectStartMs = Date.now();

    try {
      const client = getDeepgramClient();
      // Own reconnect at the app layer: disable the SDK's internal
      // auto-reconnect (`reconnectAttempts` → RWS `maxRetries`; excluded
      // from the API query params by the SDK) so a replaced socket can
      // never come back to life on its own and orphan a Deepgram session.
      //
      // P5.7 live-tuning overrides (env; defaults preserve behavior):
      // endpointing / utterance_end_ms / no_delay apply to both channels;
      // diarize=false applies to the mic channel only (the host is
      // channel-identified, so per-word speaker labels add nothing there).
      const cfg = {
        ...DEFAULT_DG_CONFIG,
        endpointing: DEEPGRAM_ENDPOINTING_MS,
        utterance_end_ms: DEEPGRAM_UTTERANCE_END_MS,
        ...(DEEPGRAM_NO_DELAY ? { no_delay: "true" } : {}),
        ...(this.logicalChannel === 0 && !DEEPGRAM_DIARIZE_MIC
          ? { diarize: "false" }
          : {}),
        reconnectAttempts: 0,
        // biome-ignore lint/suspicious/noExplicitAny: SDK internally fills Authorization
      } as any;
      this.connection = await client.listen.v1.connect(cfg);
      this.setupEventHandlers();
      this.connection.connect();
      await this.connection.waitForOpen();
    } catch (error) {
      log.error(
        error as Error,
        `Failed to create connection for ${this.sessionId}`
      );
      this.isConnecting = false;
      await this.reconnect();
    }
  }

  /**
   * Set up event handlers for the Deepgram connection.
   *
   * Handlers capture the socket reference and its generation. Events from a
   * previous generation (orphaned socket) are counted and ignored — they
   * must never mutate live connection state nor publish transcripts.
   */
  private setupEventHandlers(): void {
    const socket = this.connection;
    const generation = this.connectionGeneration;
    if (!socket) {
      return;
    }

    const isStale = (): boolean => generation !== this.connectionGeneration;

    const ignoreStale = (event: string): boolean => {
      if (isStale()) {
        incrementCounter("stt.orphan_events_total");
        log.warn(
          { generation, event },
          `Ignoring ${event} from orphaned Deepgram socket for ${this.sessionId}`
        );
        return true;
      }
      return false;
    };

    socket.on("open", () => {
      if (ignoreStale("open")) {
        // An orphan that managed to open holds a billable Deepgram session —
        // shut it down. Its close event is likewise ignored (no reconnect).
        try {
          socket.close();
        } catch {
          // Already dead; nothing to do.
        }
        return;
      }
      log.info(`Connection opened for ${this.sessionId}`);
      this.connectionStartTime = Date.now();
      if (this.connectStartMs > 0) {
        recordHistogram(
          "stt.deepgram_connect_ms",
          this.connectionStartTime - this.connectStartMs
        );
        this.connectStartMs = 0;
      }
      this.isConnected = true;
      this.isConnecting = false;
      this.retryCount = 0; // Reset retry count on successful connection
      this.startKeepAlive();
      // Fresh socket generation: Deepgram's `start` offsets reset, so the
      // client-derived stream anchor no longer describes this socket's
      // byte-0 and a new snapshot will be taken at its first send. Queued
      // (dead-window) frames and head drop counts are intentionally NOT
      // reset — they belong to the new generation and feed its snapshot.
      if (this.hasOpened) {
        this.anchorRebased = true;
      }
      this.hasOpened = true;
      this.genAnchorMs = 0;
      // Deliver anything queued while the handshake was in flight.
      this.flushPendingFrames();
    });

    socket.on("close", (event: unknown) => {
      if (ignoreStale("close")) {
        return;
      }
      const closeEvent = event as {
        code?: number;
        reason?: string;
        wasClean?: boolean;
      };
      log.info(
        { code: closeEvent?.code, reason: closeEvent?.reason },
        `Connection closed for ${this.sessionId}`
      );
      this.isConnected = false;
      this.isConnecting = false;

      // Safety flush: a transient close must not discard intermediate finals
      // already accumulated for the in-flight utterance (no-op when empty).
      // Runs before the generation bump below so its anchor still refers to
      // this socket.
      this.flushAccumulatedFinal().catch((error: unknown) => {
        log.error(
          error as Error,
          `Error flushing accumulated on close for ${this.sessionId}`
        );
      });

      // Only reconnect if NOT idle timeout (code 1011). For idle timeout we
      // reconnect on the next audio frame — but first abandon this generation
      // so late events from the dead socket cannot mutate live state.
      if (closeEvent?.code === 1011) {
        this.connection = null;
        this.connectionGeneration += 1;
        return;
      }
      if (!this.isClosed) {
        this.reconnect();
      }
    });

    socket.on("error", (error) => {
      if (ignoreStale("error")) {
        return;
      }
      log.error(error as Error, `Error for ${this.sessionId}`);
    });

    socket.on("message", (data: unknown) => {
      if (ignoreStale("message")) {
        return;
      }
      const result = data as TranscriptResult | { type: "UtteranceEnd" };
      if (result.type === "Results") {
        this.handleTranscript(result as TranscriptResult);
      } else if (result.type === "UtteranceEnd") {
        // UtteranceEnd fires after utterance_end_ms of post-speech silence.
        // This is our primary accumulator flush signal: more reliable than the
        // old setTimeout-based safety timer because it originates from Deepgram's
        // own VAD rather than a local clock heuristic.
        log.info(`UtteranceEnd received for ${this.sessionId}`);
        this.flushAccumulatedFinal();
      }
    });
  }

  /**
   * Set the perfect server-side timestamp for the start of the audio stream
   */
  setAudioStreamStart(serverAudioStartTs: number): void {
    log.info(
      `Anchor TS set for ${this.sessionId}: ${serverAudioStartTs} (previously: ${this.streamStartServerTs})`
    );
    this.streamStartServerTs = serverAudioStartTs;
  }

  /**
   * Send audio buffer to Deepgram.
   *
   * Synchronous (P4.10): every frame is enqueued first (bounded FIFO,
   * arrival order preserved) and the queue is flushed whenever the socket
   * is open — so frames that arrive during the handshake are delivered in
   * order instead of dropped. The lazy connect is fire-and-forget; the
   * socket-open handler flushes what it queued (same pattern as the
   * close-handler reconnect). Connects eagerly (see preconnect) with lazy
   * connect as the fallback.
   *
   * Each live connection is mono (see dual-channel session on the server).
   */
  sendAudio(buffer: Buffer): void {
    if (this.isClosed) {
      return;
    }

    this.enqueueFrame(buffer);

    // Lazy connect on first audio (eager preconnect normally beats this).
    if (!(this.isConnected || this.isConnecting)) {
      log.info(`Lazy connecting for ${this.sessionId} (first audio received)`);
      this.connect();
    }

    this.flushPendingFrames();
  }

  /**
   * Bounded FIFO push. Drops (and counts) the oldest frame past the cap.
   */
  private enqueueFrame(buffer: Buffer): void {
    if (this.genFirstEnqueueMs === 0) {
      this.genFirstEnqueueMs = Date.now();
    }
    if (this.pendingFrames.length >= DeepgramConnection.MAX_PENDING_FRAMES) {
      const dropped = this.pendingFrames.shift();
      const droppedBytes = dropped?.length ?? 0;
      this.droppedBytesCurrentGen += droppedBytes;
      this.droppedBytesTotal += droppedBytes;
      incrementCounter("ingest.frames_dropped_connecting_total");
    }
    this.pendingFrames.push(buffer);
  }

  /**
   * Snapshot the current generation's speech-time anchor. Called once, just
   * before its first sendMedia: first-enqueue time plus the audio duration
   * dropped ahead of it, minus one-way transit.
   */
  private snapshotGenerationAnchor(): void {
    if (this.genAnchorMs !== 0) {
      return;
    }
    this.captureTransitEstimate();
    this.genAnchorMs =
      this.genFirstEnqueueMs +
      this.droppedBytesCurrentGen / 32 -
      this.transitEstimateMs;
    this.genFirstEnqueueMs = 0;
    this.droppedBytesCurrentGen = 0;
  }

  /**
   * One-way client→server transit from the first generation (first enqueue
   * minus client-derived stream start), clamped. Later generations reuse it.
   */
  private captureTransitEstimate(): void {
    if (this.transitCaptured || this.streamStartServerTs <= 0) {
      return;
    }
    if (this.genFirstEnqueueMs > 0) {
      this.transitEstimateMs = Math.max(
        0,
        Math.min(2000, this.genFirstEnqueueMs - this.streamStartServerTs)
      );
      this.transitCaptured = true;
    }
  }

  /**
   * Start the idle KeepAlive interval (idempotent; P5.6). One timer per
   * connection object — reconnects reuse it, guarded per tick by the live
   * socket + idle check. Unref'd so tests and shutdown never hang on it
   * (permanent close clears it explicitly).
   */
  private startKeepAlive(): void {
    if (this.keepAliveTimer || this.isClosed) {
      return;
    }
    this.keepAliveTimer = setInterval(() => {
      this.sendKeepAliveIfIdle();
    }, DEEPGRAM_KEEP_ALIVE_INTERVAL_MS);
    const unref = (this.keepAliveTimer as unknown as { unref?: () => void })
      .unref;
    if (typeof unref === "function") {
      unref.call(this.keepAliveTimer);
    }
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Send one KeepAlive frame when the socket is open and has carried no
   * audio for a full interval (P5.6). Failures are warn-and-continue —
   * keepalive must never break the audio path.
   */
  private sendKeepAliveIfIdle(nowMs: number = Date.now()): void {
    const socket = this.connection;
    if (
      !shouldSendKeepAlive(
        this.isConnected && !!socket,
        this.lastAudioSendMs,
        nowMs
      )
    ) {
      return;
    }
    try {
      socket?.sendKeepAlive({ type: "KeepAlive" });
    } catch (error) {
      log.warn(
        { err: error, sessionId: this.sessionId },
        "Deepgram KeepAlive send failed"
      );
    }
  }

  /**
   * Send every queued frame in order while the socket is open. Frames that
   * cannot be delivered stay queued for the next flush (reconnect re-opens
   * the socket and the open handler flushes again).
   */
  private flushPendingFrames(): void {
    if (!(this.isConnected && this.connection)) {
      return;
    }
    const socket = this.connection;
    while (this.pendingFrames.length > 0) {
      const frame = this.pendingFrames[0];
      if (!frame) {
        break;
      }
      try {
        this.snapshotGenerationAnchor();
        socket.sendMedia(DeepgramConnection.toByteView(frame));
        this.lastAudioSendMs = Date.now();
      } catch (error) {
        // Keep the frame queued so a transient send failure loses no audio;
        // the next flush (or reconnect open) retries it in order.
        log.error(
          error as Error,
          `Failed to send queued audio for ${this.sessionId}`
        );
        break;
      }
      this.pendingFrames.shift();
    }
    // Fully drained: the head counters described audio that is now sent, so
    // a later dead window starts a fresh head. The generation snapshot (if
    // taken) and the running total are unaffected.
    if (this.pendingFrames.length === 0) {
      this.genFirstEnqueueMs = 0;
      this.droppedBytesCurrentGen = 0;
    }
  }

  /**
   * Zero-copy view of a queued frame for the Deepgram SDK (P4.10).
   * `buffer.buffer.slice(...)` copies; this shares the underlying memory
   * with the correct byte window (queued frames are often `subarray`
   * views, e.g. tag-stripped PCM).
   */
  private static toByteView(buffer: Buffer): Uint8Array {
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  /**
   * Handle incoming transcript from Deepgram
   *
   * Extracts the diarization speaker index from Deepgram's response.
   * Speaker identification (matching to team members) happens downstream.
   *
   * Accumulates intermediate is_final=true segments until speech_final=true
   * signals the complete utterance boundary. This prevents a single sentence
   * from being fragmented into multiple short final utterances when Deepgram's
   * endpointing triggers between natural speech pauses.
   *
   * See: https://developers.deepgram.com/docs/understand-endpointing-interim-results
   * "Concatenate is_final: true segments until speech_final: true is received
   *  for the complete utterance."
   */
  private async handleTranscript(result: TranscriptResult): Promise<void> {
    const { is_final, channel, start, duration } = result;
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      return;
    }

    const transcript = alternative.transcript?.trim() || "";
    if (!transcript) {
      return; // Skip empty transcripts
    }

    // --- Accumulate intermediate finals (is_final=true, speech_final=false) ---
    if (is_final && !result.speech_final) {
      this.accumulateSegment(transcript, alternative, start, duration);
      return;
    }

    // --- Publish partials immediately, never touching the accumulator ---
    if (!is_final) {
      // During accumulation, prepend accumulated text so the frontend
      // sees the full sentence grow rather than disjoint segment text.
      // Avoid duplication: if Deepgram's partial already includes the
      // accumulated text (e.g. interim results before endpointing),
      // use the raw transcript.
      const partialText =
        this.accumulatedText && !transcript.startsWith(this.accumulatedText)
          ? `${this.accumulatedText} ${transcript}`
          : transcript;

      const diarizationIndex = this.computeDiarizationIndex(alternative);
      const anchorBaseMs = this.anchorBaseMs();

      const sttResult: SttResult = {
        sessionId: this.sessionId,
        isFinal: false,
        transcript: partialText,
        confidence: Math.round((alternative.confidence || 0) * 100) / 100,
        diarizationIndex,
        channel: this.logicalChannel,
        start,
        duration,
        ts: Date.now(),
        speechTimestamp: anchorBaseMs + start * 1000,
        // P5.1: envelope type travels with the payload so the realtime
        // subscriber forwards it verbatim (no re-stringify per partial).
        type: "stt_partial",
      };
      const diarizeSummary = log.isLevelEnabled("debug")
        ? summarizeDiarizedSpeakers(alternative.words)
        : "";
      // P5.3: per-interim at debug (was info with a per-partial Set+sort);
      // finals stay at info.
      log.debug(
        `"${partialText}" | session=${this.sessionId} ` +
          `capture_ch=${this.logicalChannel} ` +
          `dg_speaker=${diarizationIndex} dg_speakers=[${diarizeSummary}] ` +
          `speech_final=false partial conf=${(alternative.confidence || 0).toFixed(2)}`
      );
      await this.publishTranscript(sttResult);
      return;
    }

    // --- speech_final=true: combine with accumulated text, publish as final ---

    const finalTranscript = this.accumulatedText
      ? `${this.accumulatedText} ${transcript}`
      : transcript;

    const finalConfidence = this.combineConfidence(alternative.confidence || 0);
    const finalStart =
      this.accumulatedSegmentCount > 0 ? this.accumulatedStart : start;
    const finalDuration =
      this.accumulatedSegmentCount > 0
        ? Math.max(this.accumulatedEnd, start + duration) - finalStart
        : duration;
    const diarizationIndex =
      this.accumulatedSegmentCount > 0
        ? this.accumulatedDiarizationIndex
        : this.computeDiarizationIndex(alternative);

    this.resetAccumulation();

    const anchorBaseMs = this.anchorBaseMs();

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: true,
      transcript: finalTranscript,
      confidence: Math.round(finalConfidence * 100) / 100,
      diarizationIndex,
      channel: this.logicalChannel,
      start: finalStart,
      duration: finalDuration,
      ts: Date.now(),
      speechTimestamp: anchorBaseMs + finalStart * 1000,
      // P5.1: see partial branch above.
      type: "stt_final",
    };
    const diarizeSummary = summarizeDiarizedSpeakers(alternative.words);
    log.info(
      `"${finalTranscript}" | session=${this.sessionId} ` +
        `capture_ch=${this.logicalChannel} ` +
        `dg_speaker=${diarizationIndex} dg_speakers=[${diarizeSummary}] ` +
        `speech_final=true final conf=${finalConfidence.toFixed(2)}`
    );
    this.recordAudioEndToFinal(anchorBaseMs, finalStart, finalDuration);
    await this.publishTranscript(sttResult);
  }

  /**
   * Publish transcript to Redis
   */
  private async publishTranscript(result: SttResult): Promise<void> {
    const channel = result.isFinal
      ? transcriptChannel(result.sessionId)
      : partialChannel(result.sessionId);

    try {
      await redis.publish(channel, JSON.stringify(result));
    } catch (error) {
      log.error(
        error as Error,
        `Failed to publish transcript for ${this.sessionId}`
      );
    }
  }

  /**
   * Flush any accumulated intermediate finals as a standalone final utterance.
   * Called on UtteranceEnd events (primary path) and on connection close (safety path).
   * If the accumulator is empty, this is a no-op.
   */
  private async flushAccumulatedFinal(): Promise<void> {
    const text = this.accumulatedText;
    if (!text) {
      return;
    }

    const confidence =
      this.accumulatedSegmentCount > 0
        ? this.accumulatedConfidence / this.accumulatedSegmentCount
        : 0;
    const start = this.accumulatedStart;
    const diarizationIndex = this.accumulatedDiarizationIndex;
    const flushDuration =
      this.accumulatedEnd > start ? this.accumulatedEnd - start : 0;

    this.resetAccumulation();

    const anchorBaseMs = this.anchorBaseMs();

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: true,
      transcript: text,
      confidence: Math.round(confidence * 100) / 100,
      diarizationIndex,
      channel: this.logicalChannel,
      start,
      duration: flushDuration,
      ts: Date.now(),
      speechTimestamp: anchorBaseMs + start * 1000,
      // P5.1: see partial branch above.
      type: "stt_final",
    };

    log.info(
      `Utterance flush: "${text}" | session=${this.sessionId} ` +
        `capture_ch=${this.logicalChannel} ` +
        `dg_speaker=${diarizationIndex}`
    );
    this.recordAudioEndToFinal(anchorBaseMs, start, flushDuration);
    await this.publishTranscript(sttResult);
  }

  /**
   * Accumulate an intermediate final segment (is_final=true, speech_final=false).
   * Concatenates text and tracks confidence, start time, and diarization index.
   */
  private accumulateSegment(
    transcript: string,
    alternative: TranscriptAlternative,
    start: number,
    duration: number
  ): void {
    this.accumulatedText += (this.accumulatedText ? " " : "") + transcript;
    this.accumulatedConfidence += alternative.confidence || 0;
    this.accumulatedSegmentCount++;
    if (this.accumulatedSegmentCount === 1) {
      this.accumulatedStart = start;
    }
    const segmentEnd = start + (duration ?? 0);
    if (segmentEnd > this.accumulatedEnd) {
      this.accumulatedEnd = segmentEnd;
    }
    const diarizationIndex = this.computeDiarizationIndex(alternative);
    if (diarizationIndex >= 0) {
      this.accumulatedDiarizationIndex = diarizationIndex;
    }
    log.debug(
      `Accumulated final segment: "${transcript}" ` +
        `(total: "${this.accumulatedText}")`
    );
  }

  /**
   * Compute weighted average confidence across accumulated segments and the
   * current segment's confidence.
   */
  private combineConfidence(currentConfidence: number): number {
    return this.accumulatedSegmentCount > 0
      ? (this.accumulatedConfidence + currentConfidence) /
          (this.accumulatedSegmentCount + 1)
      : currentConfidence;
  }

  /**
   * Reset all accumulation state after a final utterance is published or flushed.
   */
  private resetAccumulation(): void {
    this.accumulatedText = "";
    this.accumulatedConfidence = 0;
    this.accumulatedSegmentCount = 0;
    this.accumulatedStart = 0;
    this.accumulatedEnd = 0;
    this.accumulatedDiarizationIndex = -1;
  }

  /**
   * Effective speech-time anchor (server ms) for Deepgram `start` offsets on
   * the current socket: the selected anchor plus pre-first-send drop audio
   * that Deepgram never received. See the field docs above.
   */
  private anchorBaseMs(): number {
    if (this.anchorRebased) {
      return this.genAnchorMs > 0 ? this.genAnchorMs : this.connectionStartTime;
    }
    if (this.streamStartServerTs > 0) {
      return this.streamStartServerTs + this.droppedBytesTotal / 32;
    }
    if (this.genAnchorMs > 0) {
      return this.genAnchorMs;
    }
    return this.connectionStartTime;
  }

  /**
   * Record wall-clock delay between the end of spoken audio (anchor +
   * Deepgram-relative offset) and the moment we publish the final.
   * Covers Deepgram processing + endpointing + our accumulator flush.
   */
  private recordAudioEndToFinal(
    anchorBaseMs: number,
    start: number,
    duration: number
  ): void {
    if (!(anchorBaseMs > 0)) {
      return;
    }
    const delayMs = Date.now() - (anchorBaseMs + (start + duration) * 1000);
    if (Number.isFinite(delayMs) && delayMs >= 0) {
      recordHistogram("stt.audio_end_to_final_ms", delayMs);
    }
  }

  /**
   * Extract and compute the diarization index from a Deepgram transcript alternative,
   * offset by the logical channel to prevent collisions between mic (0-999) and sys
   * (1000-1999) speaker indices.
   */
  private computeDiarizationIndex(alternative: TranscriptAlternative): number {
    const raw = alternative.words?.[0]?.speaker ?? -1;
    return raw >= 0 ? raw + this.logicalChannel * 1000 : raw;
  }

  /**
   * Reconnect with exponential backoff
   */
  private async reconnect(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (this.retryCount >= this.maxRetries) {
      log.error(`Max retries exceeded for ${this.sessionId}`);
      publishSystemEvent(this.sessionId, {
        source: "deepgram",
        severity: "error",
        code: "DEEPGRAM_OFFLINE",
        message:
          "Speech-to-Text connection failed. Live transcription is offline.",
      }).catch(() => undefined);
      return;
    }

    const delay = Math.min(this.baseDelay * 2 ** this.retryCount, 30_000);
    this.retryCount++;
    incrementCounter("stt.reconnects_total");

    // Abandon the previous socket before creating a new one: bump the
    // generation so its late events are ignored, and close it so it can
    // never come back (with SDK retries disabled this is belt-and-braces,
    // but it also covers sockets created before this change).
    const stale = this.connection;
    this.connection = null;
    this.connectionGeneration += 1;
    if (stale) {
      try {
        stale.close();
      } catch {
        // Already dead; the replacement proceeds regardless.
      }
    }

    log.info(
      `Reconnecting ${this.sessionId} in ${delay}ms (attempt ${this.retryCount})`
    );

    publishSystemEvent(this.sessionId, {
      source: "deepgram",
      severity: "warning",
      code: "DEEPGRAM_RECONNECTING",
      message: `Speech-to-Text disconnected. Reconnecting... (attempt ${this.retryCount}/${this.maxRetries})`,
    }).catch(() => undefined);

    await sleep(delay);
    await this.connect();
  }

  /**
   * Close the connection permanently
   */
  async close(): Promise<void> {
    try {
      await this.flushAccumulatedFinal();
    } catch (error) {
      log.error(
        error as Error,
        `Error flushing accumulated on close for ${this.sessionId}`
      );
    }

    this.isClosed = true;
    this.isConnected = false;
    this.isConnecting = false;
    // P5.6: permanent close stops the idle KeepAlive interval.
    this.stopKeepAlive();

    if (this.connection) {
      try {
        this.connection.close();
      } catch (error) {
        log.error(
          error as Error,
          `Error closing connection for ${this.sessionId}`
        );
      }
      this.connection = null;
    }

    log.info(`Session ${this.sessionId} closed permanently`);
  }

  /**
   * Check if connection is currently active
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
