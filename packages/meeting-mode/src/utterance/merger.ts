import { MERGE_GAP_MS } from "../env";
import type { Utterance } from "./types";

export class UtteranceMerger {
  private readonly gapThreshold: number;
  private pending: Utterance | null = null;

  constructor(gapThreshold: number = MERGE_GAP_MS) {
    this.gapThreshold = gapThreshold;
  }

  push(utterance: Utterance): Utterance | null {
    if (this.pending === null) {
      this.pending = utterance;
      return null;
    }

    const shouldMerge = this.shouldMerge(this.pending, utterance);

    if (shouldMerge) {
      this.pending = this.merge(this.pending, utterance);
      return null;
    }
    const output = this.pending;
    this.pending = utterance;
    return output;
  }

  flush(): Utterance | null {
    const output = this.pending;
    this.pending = null;
    return output;
  }

  hasPending(): boolean {
    return this.pending !== null;
  }

  private shouldMerge(prev: Utterance, next: Utterance): boolean {
    // Only merge utterances from the same speaker
    if (prev.speaker.speakerId !== next.speaker.speakerId) {
      return false;
    }

    const prevEndTime = prev.timestamp + prev.duration * 1000;
    const gap = next.timestamp - prevEndTime;

    if (gap > this.gapThreshold) {
      return false;
    }

    return true;
  }

  private merge(prev: Utterance, next: Utterance): Utterance {
    const combinedText = `${prev.text.trimEnd()} ${next.text}`;

    const totalWords = prev.wordCount + next.wordCount;
    const weightedConfidence =
      totalWords > 0
        ? (prev.confidenceScore * prev.wordCount +
            next.confidenceScore * next.wordCount) /
          totalWords
        : (prev.confidenceScore + next.confidenceScore) / 2;

    const gap =
      (next.timestamp - (prev.timestamp + prev.duration * 1000)) / 1000;

    const combinedDuration = prev.duration + Math.max(0, gap) + next.duration;

    return {
      utteranceId: prev.utteranceId,
      sessionId: prev.sessionId,
      speaker: prev.speaker,
      text: combinedText,
      timestamp: prev.timestamp,
      confidenceScore: Math.round(weightedConfidence * 100) / 100,
      startOffset: prev.startOffset,
      duration: Math.round(combinedDuration * 100) / 100,
      wordCount: totalWords,
      mergedCount: prev.mergedCount + next.mergedCount,
    };
  }
}
