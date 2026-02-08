import type { SpeakerType, Utterance } from "./types";

/**
 * Configuration for the ring buffer
 */
export interface RingBufferConfig {
  /** Maximum number of utterances to store */
  maxSize: number;

  /** Maximum age of utterances in milliseconds (default: 120 seconds) */
  maxAgeMs: number;

  /** Maximum total character count for context window */
  maxCharacters: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RingBufferConfig = {
  maxSize: 100, // 100 utterances max
  maxAgeMs: 120 * 1000, // 120 seconds
  maxCharacters: 8000, // ~2000 tokens for context
};

/**
 * Ring Buffer for Utterances
 *
 * A fixed-size circular buffer that stores recent utterances.
 * Automatically evicts old entries based on size and age.
 */
export class RingBuffer {
  private readonly buffer: (Utterance | null)[];
  private head: number; // Points to next write position
  private tail: number; // Points to oldest entry
  private count: number; // Current number of entries
  private readonly config: RingBufferConfig;

  constructor(config: Partial<RingBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buffer = new Array(this.config.maxSize).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Add an utterance to the buffer
   *
   * If the buffer is full, the oldest entry is overwritten.
   */
  push(utterance: Utterance): void {
    // Store at head position
    this.buffer[this.head] = utterance;

    // Move head forward
    this.head = (this.head + 1) % this.config.maxSize;

    // If we overwrote the tail, move tail forward
    if (this.count === this.config.maxSize) {
      this.tail = (this.tail + 1) % this.config.maxSize;
    } else {
      this.count++;
    }

    // Evict old entries based on age
    this.evictOld();
  }

  /**
   * Get the N most recent utterances
   */
  getRecent(n: number): Utterance[] {
    if (this.count === 0) {
      return [];
    }

    const result: Utterance[] = [];
    const limit = Math.min(n, this.count);

    // Start from most recent (head - 1) and go backwards
    let index = (this.head - 1 + this.config.maxSize) % this.config.maxSize;

    for (let i = 0; i < limit; i++) {
      const utterance = this.buffer[index];
      if (utterance) {
        result.unshift(utterance); // Add to front to maintain order
      }
      index = (index - 1 + this.config.maxSize) % this.config.maxSize;
    }

    return result;
  }

  /**
   * Get all utterances (newest first)
   */
  getAll(): Utterance[] {
    return this.getRecent(this.count);
  }

  /**
   * Get utterances filtered by topic
   */
  getByTopic(topicId: string): Utterance[] {
    const all = this.getAll();

    // Note: Utterances need a topicId field for this to work
    // This is added during topic assignment (Week 2)
    return all.filter(
      (u) => (u as Utterance & { topicId?: string }).topicId === topicId
    );
  }

  /**
   * Get utterances filtered by speaker type (TEAM or EXTERNAL)
   */
  getBySpeakerType(type: SpeakerType): Utterance[] {
    return this.getAll().filter((u) => u.speaker.type === type);
  }

  /**
   * Get utterances filtered by specific speaker ID
   */
  getBySpeakerId(speakerId: string): Utterance[] {
    return this.getAll().filter((u) => u.speaker.speakerId === speakerId);
  }

  /**
   * Get utterances filtered by user ID (for identified team members)
   */
  getByUserId(userId: string): Utterance[] {
    return this.getAll().filter((u) => u.speaker.userId === userId);
  }

  /**
   * Get utterances within a time window
   */
  getWithinTimeWindow(windowMs: number): Utterance[] {
    const now = Date.now();
    const cutoff = now - windowMs;

    return this.getAll().filter((u) => u.timestamp >= cutoff);
  }

  /**
   * Assemble context for LLM calls
   *
   * Returns utterances formatted as a string, respecting character limits.
   * Most recent utterances are prioritized.
   *
   * @param maxCharacters - Maximum characters in output (default from config)
   * @param format - Format function for each utterance
   */
  assembleContext(
    maxCharacters?: number,
    format?: (u: Utterance) => string
  ): string {
    const charLimit = maxCharacters || this.config.maxCharacters;
    const formatFn = format || this.defaultFormat;

    const utterances = this.getRecent(this.count);
    const lines: string[] = [];
    let totalChars = 0;

    // Process from oldest to newest, but we'll need to respect limit
    // So we iterate backwards (newest first) to prioritize recent
    for (let i = utterances.length - 1; i >= 0; i--) {
      const utterance = utterances[i];
      if (!utterance) {
        continue;
      }

      const formatted = formatFn(utterance);

      if (totalChars + formatted.length > charLimit) {
        // Would exceed limit, stop adding
        break;
      }

      lines.unshift(formatted); // Add to front
      totalChars += formatted.length + 1; // +1 for newline
    }

    return lines.join("\n");
  }

  /**
   * Default formatting for utterances
   */
  private defaultFormat(u: Utterance): string {
    const timestamp = new Date(u.timestamp).toLocaleTimeString();
    return `[${timestamp}] ${u.speaker.name}: ${u.text}`;
  }

  /**
   * Evict entries older than maxAgeMs
   */
  private evictOld(): void {
    if (this.count === 0) {
      return;
    }

    const now = Date.now();
    const cutoff = now - this.config.maxAgeMs;

    // Check from tail (oldest entries)
    while (this.count > 0) {
      const oldest = this.buffer[this.tail];
      if (!oldest || oldest.timestamp >= cutoff) {
        break; // Entry is fresh enough
      }

      // Evict this entry
      this.buffer[this.tail] = null;
      this.tail = (this.tail + 1) % this.config.maxSize;
      this.count--;
    }
  }

  /**
   * Get current buffer statistics
   */
  getStats(): {
    count: number;
    maxSize: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
    totalCharacters: number;
  } {
    let oldest: number | null = null;
    let newest: number | null = null;
    let totalChars = 0;

    const all = this.getAll();
    for (const u of all) {
      if (oldest === null || u.timestamp < oldest) {
        oldest = u.timestamp;
      }
      if (newest === null || u.timestamp > newest) {
        newest = u.timestamp;
      }
      totalChars += u.text.length;
    }

    return {
      count: this.count,
      maxSize: this.config.maxSize,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
      totalCharacters: totalChars,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Check if buffer is full
   */
  isFull(): boolean {
    return this.count === this.config.maxSize;
  }
}
