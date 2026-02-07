import type { RingBuffer } from "../utterance/ring-buffer";
import type { Utterance } from "../utterance/types";

/**
 * Context assembly options
 */
export interface ContextAssemblyOptions {
  /** Maximum characters in the assembled context */
  maxCharacters: number;

  /** Include only utterances from specific topic */
  topicId?: string;

  /** Include only utterances from specific speaker */
  speaker?: "YOU" | "THEM";

  /** Time window in milliseconds */
  timeWindowMs?: number;

  /** Include timestamps in output */
  includeTimestamps?: boolean;

  /** Custom prefix for the context */
  prefix?: string;

  /** Custom suffix for the context */
  suffix?: string;
}

/**
 * Assembled context result
 */
export interface AssembledContext {
  /** The formatted context string */
  text: string;

  /** Number of utterances included */
  utteranceCount: number;

  /** Total character count */
  characterCount: number;

  /** Time span covered (ms) */
  timeSpan: number;

  /** Topics included */
  topics: string[];

  /** Was the context truncated due to limits? */
  truncated: boolean;
}

/**
 * Context Assembler
 *
 * Builds optimized context windows for LLM calls.
 * Handles character limits, topic filtering, and formatting.
 */
export class ContextAssembler {
  private readonly buffer: RingBuffer;

  constructor(buffer: RingBuffer) {
    this.buffer = buffer;
  }

  /**
   * Assemble context with given options
   */
  assemble(options: ContextAssemblyOptions): AssembledContext {
    const {
      maxCharacters,
      topicId,
      speaker,
      timeWindowMs,
      includeTimestamps = true,
      prefix = "",
      suffix = "",
    } = options;

    // Get all utterances
    let utterances = this.buffer.getAll();

    // Apply filters
    if (topicId) {
      utterances = utterances.filter((u) => u.topicId === topicId);
    }

    if (speaker) {
      utterances = utterances.filter((u) => u.speaker === speaker);
    }

    if (timeWindowMs) {
      const cutoff = Date.now() - timeWindowMs;
      utterances = utterances.filter((u) => u.timestamp >= cutoff);
    }

    // Build context respecting character limit
    const reservedChars = prefix.length + suffix.length;
    const availableChars = maxCharacters - reservedChars;

    const lines: string[] = [];
    const topicsSet = new Set<string>();
    let totalChars = 0;
    let truncated = false;
    let minTimestamp = Number.POSITIVE_INFINITY;
    let maxTimestamp = 0;

    // Process from newest to oldest (prioritize recent)
    for (let i = utterances.length - 1; i >= 0; i--) {
      const utterance = utterances[i];
      if (!utterance) {
        continue;
      }

      const formatted = this.formatUtterance(utterance, includeTimestamps);

      // Check if adding this would exceed limit
      if (totalChars + formatted.length + 1 > availableChars) {
        truncated = true;
        break;
      }

      lines.unshift(formatted);
      totalChars += formatted.length + 1;

      // Track metadata
      if (utterance.topicId) {
        topicsSet.add(utterance.topicId);
      }
      minTimestamp = Math.min(minTimestamp, utterance.timestamp);
      maxTimestamp = Math.max(maxTimestamp, utterance.timestamp);
    }

    // Build final text
    const contextBody = lines.join("\n");
    const fullText = prefix + contextBody + suffix;

    return {
      text: fullText,
      utteranceCount: lines.length,
      characterCount: fullText.length,
      timeSpan: maxTimestamp > minTimestamp ? maxTimestamp - minTimestamp : 0,
      topics: Array.from(topicsSet),
      truncated,
    };
  }

  /**
   * Assemble context for risk evaluation
   *
   * Includes recent utterances + any relevant constraints
   */
  assembleForRiskEvaluation(
    constraints: string[] = [],
    maxCharacters = 4000
  ): AssembledContext {
    // Reserve space for constraints
    const constraintText =
      constraints.length > 0
        ? `\nRelevant constraints:\n${constraints.map((c) => `- ${c}`).join("\n")}\n`
        : "";

    return this.assemble({
      maxCharacters: maxCharacters - constraintText.length,
      includeTimestamps: false,
      prefix: "Recent conversation:\n",
      suffix: constraintText,
    });
  }

  /**
   * Assemble context for a specific topic
   */
  assembleForTopic(topicId: string, maxCharacters = 2000): AssembledContext {
    return this.assemble({
      maxCharacters,
      topicId,
      includeTimestamps: true,
      prefix: "Discussion on this topic:\n",
    });
  }

  /**
   * Get a summary of recent activity
   */
  getSummary(): {
    recentUtterances: number;
    yourUtterances: number;
    theirUtterances: number;
    timeSpanMs: number;
    averageUtteranceLength: number;
  } {
    const all = this.buffer.getAll();
    const yours = all.filter((u) => u.speaker === "YOU");
    const theirs = all.filter((u) => u.speaker === "THEM");

    const stats = this.buffer.getStats();
    const avgLength = all.length > 0 ? stats.totalCharacters / all.length : 0;

    return {
      recentUtterances: all.length,
      yourUtterances: yours.length,
      theirUtterances: theirs.length,
      timeSpanMs:
        stats.newestTimestamp && stats.oldestTimestamp
          ? stats.newestTimestamp - stats.oldestTimestamp
          : 0,
      averageUtteranceLength: Math.round(avgLength),
    };
  }

  /**
   * Format a single utterance
   */
  private formatUtterance(
    utterance: Utterance,
    includeTimestamp: boolean
  ): string {
    if (includeTimestamp) {
      const time = new Date(utterance.timestamp).toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return `[${time}] ${utterance.speaker}: ${utterance.text}`;
    }
    return `${utterance.speaker}: ${utterance.text}`;
  }
}
