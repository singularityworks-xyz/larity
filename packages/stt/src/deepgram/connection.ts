/**
 * deepgram/connection.ts — Deepgram Live Connection
 *
 * Manages a live transcription connection for a single session.
 * Uses lazy connection - only connects when first audio arrives.
 * Handles transcript events and publishes to Redis.
 */

import { redis } from "@larity/infra/redis";
import { partialChannel, transcriptChannel } from "../channels";
import { createSttLogger } from "../logger";
import type { SttResult } from "../types";
import { getDeepgramClient } from "./client";
import {
  DEFAULT_DG_CONFIG,
  type DeepgramWord,
  type TranscriptAlternative,
  type TranscriptResult,
} from "./types";

/** Minimal handle for a v5 Listen V1 WebSocket connection. */
interface LiveConnection {
  on(event: string, callback: (...args: unknown[]) => void): void;
  sendMedia(message: ArrayBuffer | Blob | ArrayBufferView): void;
  connect(): void;
  close(): void;
  waitForOpen(): Promise<unknown>;
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
  private streamStartServerTs = 0;

  // Accumulation state for stitching intermediate is_final=true segments
  // until speech_final=true signals the end of the utterance.
  // See: https://developers.deepgram.com/docs/understand-endpointing-interim-results
  private accumulatedText = "";
  private accumulatedConfidence = 0;
  private accumulatedSegmentCount = 0;
  private accumulatedStart = 0;
  private accumulatedDiarizationIndex = -1;
  private speechFinalFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SPEECH_FINAL_FLUSH_MS = 5000;

  // Reconnection state
  private retryCount = 0;
  private readonly maxRetries = 5;
  private readonly baseDelay = 100; // ms

  constructor(sessionId: string, logicalChannel = 0) {
    this.sessionId = sessionId;
    this.logicalChannel = logicalChannel;
  }

  /**
   * Connect to Deepgram (called lazily on first audio)
   */
  private async connect(): Promise<void> {
    if (this.isClosed || this.isConnecting || this.isConnected) {
      return;
    }

    this.isConnecting = true;

    try {
      const client = getDeepgramClient();
      // biome-ignore lint/suspicious/noExplicitAny: SDK internally fills Authorization
      const cfg = DEFAULT_DG_CONFIG as any;
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
   * Set up event handlers for the Deepgram connection
   */
  private setupEventHandlers(): void {
    if (!this.connection) {
      return;
    }

    this.connection.on("open", () => {
      log.info(`Connection opened for ${this.sessionId}`);
      this.connectionStartTime = Date.now();
      this.isConnected = true;
      this.isConnecting = false;
      this.retryCount = 0; // Reset retry count on successful connection
    });

    this.connection.on("close", (event: unknown) => {
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

      // Only reconnect if NOT idle timeout (code 1011)
      // For idle timeout, we'll reconnect on next audio frame
      if (closeEvent?.code !== 1011 && !this.isClosed) {
        this.reconnect();
      }
    });

    this.connection.on("error", (error) => {
      log.error(error as Error, `Error for ${this.sessionId}`);
    });

    this.connection.on("message", (data: unknown) => {
      const result = data as TranscriptResult;
      if (result.type === "Results") {
        this.handleTranscript(result);
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
   * Send audio buffer to Deepgram
   * Lazily connects if not already connected.
   *
   * Each live connection is mono (see dual-channel session on the server).
   */
  async sendAudio(buffer: Buffer): Promise<void> {
    if (this.isClosed) {
      return;
    }

    // Lazy connect on first audio
    if (!(this.isConnected || this.isConnecting)) {
      log.info(`Lazy connecting for ${this.sessionId} (first audio received)`);
      await this.connect();
    }

    // Wait for connection to become ready (up to 1s, polling every 10ms).
    // This replaces the old unconditional sleep(100) which dropped all frames
    // that arrived before the WebSocket handshake completed.
    if (this.isConnecting) {
      const deadline = Date.now() + 1000;
      while (this.isConnecting && Date.now() < deadline) {
        await sleep(10);
      }
    }

    if (!(this.isConnected && this.connection)) {
      // Drop audio during connection establishment
      return;
    }

    // Convert Buffer to ArrayBuffer for Deepgram SDK
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    this.connection.sendMedia(arrayBuffer as ArrayBuffer);
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
      this.accumulateSegment(transcript, alternative, start);
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
      const anchorTs =
        this.streamStartServerTs > 0
          ? this.streamStartServerTs
          : this.connectionStartTime;

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
        speechTimestamp: anchorTs + start * 1000,
      };
      const diarizeSummary = summarizeDiarizedSpeakers(alternative.words);
      log.info(
        `"${partialText}" | session=${this.sessionId} ` +
          `capture_ch=${this.logicalChannel} ` +
          `dg_speaker=${diarizationIndex} dg_speakers=[${diarizeSummary}] ` +
          `speech_final=false partial conf=${(alternative.confidence || 0).toFixed(2)}`
      );
      await this.publishTranscript(sttResult);
      return;
    }

    // --- speech_final=true: combine with accumulated text, publish as final ---
    this.clearSpeechFinalFlushTimer();

    const finalTranscript = this.accumulatedText
      ? `${this.accumulatedText} ${transcript}`
      : transcript;

    const finalConfidence = this.combineConfidence(alternative.confidence || 0);
    const finalStart =
      this.accumulatedSegmentCount > 0 ? this.accumulatedStart : start;
    const diarizationIndex =
      this.accumulatedSegmentCount > 0
        ? this.accumulatedDiarizationIndex
        : this.computeDiarizationIndex(alternative);

    this.resetAccumulation();

    const anchorTs =
      this.streamStartServerTs > 0
        ? this.streamStartServerTs
        : this.connectionStartTime;

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: true,
      transcript: finalTranscript,
      confidence: Math.round(finalConfidence * 100) / 100,
      diarizationIndex,
      channel: this.logicalChannel,
      start: finalStart,
      duration,
      ts: Date.now(),
      speechTimestamp: anchorTs + finalStart * 1000,
    };
    const diarizeSummary = summarizeDiarizedSpeakers(alternative.words);
    log.info(
      `"${finalTranscript}" | session=${this.sessionId} ` +
        `capture_ch=${this.logicalChannel} ` +
        `dg_speaker=${diarizationIndex} dg_speakers=[${diarizeSummary}] ` +
        `speech_final=true final conf=${finalConfidence.toFixed(2)}`
    );
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
   * Reset the safety flush timer for accumulated intermediate finals.
   * If speech_final doesn't arrive within the timeout, the accumulated
   * text is flushed as a standalone final utterance.
   */
  private resetSpeechFinalFlushTimer(): void {
    this.clearSpeechFinalFlushTimer();
    this.speechFinalFlushTimer = setTimeout(() => {
      this.flushAccumulatedFinal();
    }, this.SPEECH_FINAL_FLUSH_MS);
  }

  /**
   * Clear the safety flush timer without flushing.
   */
  private clearSpeechFinalFlushTimer(): void {
    if (this.speechFinalFlushTimer !== null) {
      clearTimeout(this.speechFinalFlushTimer);
      this.speechFinalFlushTimer = null;
    }
  }

  /**
   * Flush any accumulated intermediate finals as a standalone final utterance.
   * This serves as a safety net: if Deepgram never sends speech_final=true
   * (e.g., due to connection loss or unusual audio), accumulated text is
   * still published rather than silently dropped.
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

    this.resetAccumulation();
    this.clearSpeechFinalFlushTimer();

    const anchorTs =
      this.streamStartServerTs > 0
        ? this.streamStartServerTs
        : this.connectionStartTime;

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: true,
      transcript: text,
      confidence: Math.round(confidence * 100) / 100,
      diarizationIndex,
      channel: this.logicalChannel,
      start,
      duration: 0,
      ts: Date.now(),
      speechTimestamp: anchorTs + start * 1000,
    };

    log.info(
      `Safety flush: "${text}" | session=${this.sessionId} ` +
        `capture_ch=${this.logicalChannel} ` +
        `dg_speaker=${diarizationIndex}`
    );
    await this.publishTranscript(sttResult);
  }

  /**
   * Accumulate an intermediate final segment (is_final=true, speech_final=false).
   * Concatenates text and tracks confidence, start time, and diarization index.
   * Resets the safety flush timer.
   */
  private accumulateSegment(
    transcript: string,
    alternative: TranscriptAlternative,
    start: number
  ): void {
    this.accumulatedText += (this.accumulatedText ? " " : "") + transcript;
    this.accumulatedConfidence += alternative.confidence || 0;
    this.accumulatedSegmentCount++;
    if (this.accumulatedSegmentCount === 1) {
      this.accumulatedStart = start;
    }
    this.accumulatedDiarizationIndex =
      this.computeDiarizationIndex(alternative);
    this.resetSpeechFinalFlushTimer();
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
    this.accumulatedDiarizationIndex = -1;
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
      return;
    }

    const delay = Math.min(this.baseDelay * 2 ** this.retryCount, 30_000);
    this.retryCount++;

    log.info(
      `Reconnecting ${this.sessionId} in ${delay}ms (attempt ${this.retryCount})`
    );

    await sleep(delay);
    await this.connect();
  }

  /**
   * Close the connection permanently
   */
  close(): void {
    this.flushAccumulatedFinal();

    this.isClosed = true;
    this.isConnected = false;
    this.isConnecting = false;

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
