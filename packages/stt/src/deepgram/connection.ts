/**
 * deepgram/connection.ts — Deepgram Live Connection
 *
 * Manages a live transcription connection for a single session.
 * Uses lazy connection - only connects when first audio arrives.
 * Handles transcript events and publishes to Redis.
 */

import type { ListenLiveClient } from "@deepgram/sdk";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { redis } from "@larity/infra/redis";
import { partialChannel, transcriptChannel } from "../channels";
import { createSttLogger } from "../logger";
import type { SttResult } from "../types";
import { getDeepgramClient } from "./client";
import {
  DEFAULT_DG_CONFIG,
  type DeepgramWord,
  type TranscriptResult,
} from "./types";

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
  private connection: ListenLiveClient | null = null;
  private readonly sessionId: string;
  /** Logical capture channel: 0 = host mic, 1 = system / loopback (stamped on SttResult.channel). */
  private readonly logicalChannel: number;
  private isConnected = false;
  private isConnecting = false;
  private isClosed = false;
  private connectionStartTime = 0;

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
      this.connection = client.listen.live(DEFAULT_DG_CONFIG);
      this.setupEventHandlers();
    } catch (error) {
      log.error(`Failed to create connection for ${this.sessionId}:`, error);
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

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      log.info(`Connection opened for ${this.sessionId}`);
      this.connectionStartTime = Date.now();
      this.isConnected = true;
      this.isConnecting = false;
      this.retryCount = 0; // Reset retry count on successful connection
    });

    this.connection.on(LiveTranscriptionEvents.Close, (event: unknown) => {
      const closeEvent = event as {
        code?: number;
        reason?: string;
        wasClean?: boolean;
      };
      log.info(`Connection closed for ${this.sessionId}`, {
        code: closeEvent?.code,
        reason: closeEvent?.reason,
      });
      this.isConnected = false;
      this.isConnecting = false;

      // Only reconnect if NOT idle timeout (code 1011)
      // For idle timeout, we'll reconnect on next audio frame
      if (closeEvent?.code !== 1011 && !this.isClosed) {
        this.reconnect();
      }
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      log.error(`Error for ${this.sessionId}:`, error);
    });

    this.connection.on(
      LiveTranscriptionEvents.Transcript,
      (result: TranscriptResult) => {
        this.handleTranscript(result);
      }
    );
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
    this.connection.send(arrayBuffer);
  }

  /**
   * Handle incoming transcript from Deepgram
   *
   * Extracts the diarization speaker index from Deepgram's response.
   * Speaker identification (matching to team members) happens downstream.
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

    // Extract diarization index from words if available
    // Deepgram includes speaker index per word when diarize=true
    // Default to -1 if not available (e.g. first few seconds or empty words)
    const diarizationIndex = alternative.words?.[0]?.speaker ?? -1;
    const channelIndex = this.logicalChannel;

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: is_final,
      transcript,
      confidence: alternative.confidence || 0,
      diarizationIndex,
      channel: channelIndex,
      start,
      duration,
      ts: Date.now(),
      speechTimestamp: this.connectionStartTime + start * 1000,
    };

    const diarizeSummary = summarizeDiarizedSpeakers(alternative.words);
    log.info(
      `"${transcript}" | session=${this.sessionId} capture_ch=${channelIndex} ` +
        `dg_speaker=${diarizationIndex} dg_speakers=[${diarizeSummary}] ` +
        `speech_final=${result.speech_final} ${is_final ? "final" : "partial"} ` +
        `conf=${(alternative.confidence || 0).toFixed(2)}`
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
      log.error(`Failed to publish transcript for ${this.sessionId}:`, error);
    }
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
    this.isClosed = true;
    this.isConnected = false;
    this.isConnecting = false;

    if (this.connection) {
      try {
        this.connection.requestClose();
      } catch (error) {
        log.error(`Error closing connection for ${this.sessionId}:`, error);
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
