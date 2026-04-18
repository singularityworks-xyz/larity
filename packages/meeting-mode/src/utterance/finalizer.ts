import type { SttResult } from "../../../stt/src/types";
import { utteranceChannel } from "../channels";
import { createMeetingModeLogger } from "../logger";
import type { SpeakerIdentifier } from "../speaker/identifier";
import { TopicManager, type TopicPublisher } from "../topic/manager";
import { PartialBuffer } from "./buffer";
import { UtteranceMerger } from "./merger";
import { RingBuffer } from "./ring-buffer";
import { createUnidentifiedSpeaker, type Utterance } from "./types";

const log = createMeetingModeLogger("utterance-finalizer");

export interface UtterancePublisher extends TopicPublisher {
  publish(channel: string, message: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
}

export type RetroactiveUpdateHandler = (
  utterance: Utterance,
  oldSpeakerType: string
) => Promise<void>;

export class UtteranceFinalizer {
  private readonly buffer = new Map<string, PartialBuffer>();
  private readonly mergers = new Map<string, UtteranceMerger>();
  private readonly sequences = new Map<string, number>();
  private readonly publisher: UtterancePublisher;
  private readonly ringBuffers = new Map<string, RingBuffer>();
  private readonly speakerIdentifiers = new Map<string, SpeakerIdentifier>();
  private readonly retroactiveHandlers: RetroactiveUpdateHandler[] = [];
  private readonly topicManager: TopicManager;

  constructor(publisher: UtterancePublisher) {
    this.publisher = publisher;
    this.topicManager = new TopicManager(publisher);
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
      speaker: this.resolveSpeaker(
        sessionId,
        result.diarizationIndex,
        finalized.timestamp
      ),
      text: normalizedText,
      timestamp: finalized.timestamp,
      confidenceScore: finalized.confidence,
      startOffset: finalized.startOffset,
      duration: finalized.duration,
      wordCount,
      mergedCount: 1,
    };

    // Assign topic
    const topicId = await this.topicManager.assignTopic(utterance);
    utterance.topicId = topicId;

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

  getRingBuffer(sessionId: string): RingBuffer | undefined {
    return this.ringBuffers.get(sessionId);
  }

  async closeSession(sessionId: string): Promise<void> {
    log.info({ sessionId }, "Closing session");

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

  private resolveSpeaker(
    sessionId: string,
    diarizationIndex: number,
    timestamp: number
  ): Utterance["speaker"] {
    const identifier = this.speakerIdentifiers.get(sessionId);
    if (identifier) {
      return identifier.identifySpeaker(diarizationIndex, timestamp);
    }
    return createUnidentifiedSpeaker(diarizationIndex);
  }

  private async publishUtterance(utterance: Utterance): Promise<void> {
    const channel = utteranceChannel(utterance.sessionId);
    const message = JSON.stringify(utterance);

    try {
      await this.publisher.publish(channel, message);
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
