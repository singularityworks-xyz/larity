/**
 * deepgram/connection.ts — Deepgram Live Connection
 *
 * Manages a live transcription connection for a single session.
 * Uses lazy connection - only connects when first audio arrives.
 * Handles transcript events and publishes to Redis.
 */

import type { ListenLiveClient } from "@deepgram/sdk";
import { LiveTranscriptionEvents } from "@deepgram/sdk";
import { redis } from "../../../infra/redis";
import { partialChannel, transcriptChannel } from "../channels";
import type { AudioSource, SttResult } from "../types";
import { getDeepgramClient } from "./client";
import { DEFAULT_DG_CONFIG, type TranscriptResult } from "./types";

/**
 * Sleep utility for reconnection delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * DeepgramConnection manages a live transcription session.
 *
 * Responsibilities:
 * - Open/close Deepgram WebSocket connection (lazy on first audio)
 * - Send audio buffers to Deepgram
 * - Handle transcript events → publish to Redis
 * - Implement exponential backoff reconnection
 * - Speaker tagging based on audio source
 */
export class DeepgramConnection {
  private connection: ListenLiveClient | null = null;
  private readonly sessionId: string;
  private currentSource: AudioSource = "mic";
  private isConnected = false;
  private isConnecting = false;
  private isClosed = false;

  // Reconnection state
  private retryCount = 0;
  private readonly maxRetries = 5;
  private readonly baseDelay = 100; // ms

  constructor(sessionId: string) {
    this.sessionId = sessionId;
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
      console.error(
        `[DG] Failed to create connection for ${this.sessionId}:`,
        error
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

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log(`[DG] Connection opened for ${this.sessionId}`);
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
      console.log(`[DG] Connection closed for ${this.sessionId}`, {
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
      console.error(`[DG] Error for ${this.sessionId}:`, error);
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
   * Lazily connects if not already connected
   */
  async sendAudio(buffer: Buffer, source: AudioSource): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.currentSource = source;

    // Lazy connect on first audio
    if (!(this.isConnected || this.isConnecting)) {
      console.log(
        `[DG] Lazy connecting for ${this.sessionId} (first audio received)`
      );
      await this.connect();
      // Wait a bit for connection to establish
      await sleep(100);
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

    const sttResult: SttResult = {
      sessionId: this.sessionId,
      isFinal: is_final,
      transcript,
      confidence: alternative.confidence || 0,
      speaker: this.currentSource === "mic" ? "YOU" : "THEM",
      start,
      duration,
      ts: Date.now(),
    };

    console.log(
      `[DG] Transcript: "${transcript}" (${is_final ? "final" : "partial"})`
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
      console.error(
        `[DG] Failed to publish transcript for ${this.sessionId}:`,
        error
      );
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
      console.error(`[DG] Max retries exceeded for ${this.sessionId}`);
      return;
    }

    const delay = Math.min(this.baseDelay * 2 ** this.retryCount, 30_000);
    this.retryCount++;

    console.log(
      `[DG] Reconnecting ${this.sessionId} in ${delay}ms (attempt ${this.retryCount})`
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
        console.error(
          `[DG] Error closing connection for ${this.sessionId}:`,
          error
        );
      }
      this.connection = null;
    }

    console.log(`[DG] Session ${this.sessionId} closed permanently`);
  }

  /**
   * Check if connection is currently active
   */
  get connected(): boolean {
    return this.isConnected;
  }
}
