import type { SttResult } from "../../../stt/src/types";
import { utteranceChannel } from "../channels";
import { PartialBuffer } from "./buffer";
import { UtteranceMerger } from "./merger";
import { RingBuffer } from "./ring-buffer";
import type { Utterance } from "./types";
import { createUnidentifiedSpeaker } from "./types";

export interface UtterancePublisher {
  publish(channel: string, message: string): Promise<number>;
}

export class UtteranceFinalizer {
  private readonly buffer = new Map<string, PartialBuffer>();
  private readonly mergers = new Map<string, UtteranceMerger>();
  private readonly sequences = new Map<string, number>();
  private readonly publisher: UtterancePublisher;
  private readonly ringBuffers = new Map<string, RingBuffer>();
  constructor(publisher: UtterancePublisher) {
    this.publisher = publisher;
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
    const finalized = buffer.finalize(result);
    if (!finalized.text.trim()) {
      return;
    }

    const normalizedText = normalizePunctuation(finalized.text);

    const wordCount = countWords(normalizedText);

    const utterance: Utterance = {
      utteranceId: this.generateUtteranceId(sessionId),
      sessionId,
      speaker: createUnidentifiedSpeaker(result.diarizationIndex),
      text: normalizedText,
      timestamp: finalized.timestamp,
      confidenceScore: finalized.confidence,
      startOffset: finalized.startOffset,
      duration: finalized.duration,
      wordCount,
      mergedCount: 1,
    };

    const merger = this.getOrCreateMerger(sessionId);
    const toPublish = merger.push(utterance);

    if (toPublish) {
      await this.publishUtterance(toPublish);
    }

    let ringBuffer = this.ringBuffers.get(sessionId);
    if (!ringBuffer) {
      ringBuffer = new RingBuffer({ maxSize: 100, maxAgeMs: 120_000 });
      this.ringBuffers.set(sessionId, ringBuffer);
    }
    ringBuffer.push(utterance);
  }

  async closeSession(sessionId: string): Promise<void> {
    console.log(`[UtteranceFinalizer] Closing session: ${sessionId}`);

    const merger = this.mergers.get(sessionId);
    if (merger) {
      const pending = merger.flush();
      if (pending) {
        await this.publishUtterance(pending);
      }
    }

    this.buffer.delete(sessionId);
    this.mergers.delete(sessionId);
    this.sequences.delete(sessionId);
    this.ringBuffers.delete(sessionId);
  }

  async closeAll(): Promise<void> {
    console.log("[UtteranceFinalizer] Closing all sessions");

    const sessionIds = [...this.buffer.keys()];

    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId);
    }

    console.log(`[UtteranceFinalizer] closed ${sessionIds.length} sessions`);
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
      merger = new UtteranceMerger();
      this.mergers.set(sessionId, merger);
    }
    return merger;
  }

  private generateUtteranceId(sessionId: string): string {
    const sequence = this.sequences.get(sessionId) || 0;
    this.sequences.set(sessionId, sequence + 1);
    return `${sessionId}:${sequence}`;
  }

  private async publishUtterance(utterance: Utterance): Promise<void> {
    const channel = utteranceChannel(utterance.sessionId);
    const message = JSON.stringify(utterance);

    try {
      await this.publisher.publish(channel, message);
      console.log(
        `[UtteranceFinalizer] Published: ${utterance.utteranceId} ` +
          `"${utterance.text.substring(0, 50)}..."`
      );
    } catch (error) {
      console.error(
        `[UtteranceFinalizer] Failed to publish ${utterance.utteranceId}:`,
        error
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
