import type { SpeakerType, Utterance } from "./types";

export interface RingBufferConfig {
  maxAgeMs: number;

  maxCharacters: number;
  maxSize: number;
}

const DEFAULT_CONFIG: RingBufferConfig = {
  maxSize: 100,
  maxAgeMs: 120 * 1000,
  maxCharacters: 8000,
};

export class RingBuffer {
  private readonly buffer: (Utterance | null)[];
  private head: number;
  private tail: number;
  private count: number;
  private readonly config: RingBufferConfig;

  constructor(config: Partial<RingBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.buffer = new Array(this.config.maxSize).fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  push(utterance: Utterance): void {
    this.buffer[this.head] = utterance;

    this.head = (this.head + 1) % this.config.maxSize;

    if (this.count === this.config.maxSize) {
      this.tail = (this.tail + 1) % this.config.maxSize;
    } else {
      this.count++;
    }

    this.evictOld();
  }

  getRecent(n: number): Utterance[] {
    if (this.count === 0) {
      return [];
    }

    const result: Utterance[] = [];
    const limit = Math.min(n, this.count);

    let index = (this.head - 1 + this.config.maxSize) % this.config.maxSize;

    for (let i = 0; i < limit; i++) {
      const utterance = this.buffer[index];
      if (utterance) {
        result.unshift(utterance);
      }
      index = (index - 1 + this.config.maxSize) % this.config.maxSize;
    }

    return result;
  }

  getAll(): Utterance[] {
    return this.getRecent(this.count);
  }

  getByTopic(topicId: string): Utterance[] {
    const all = this.getAll();

    return all.filter(
      (u) => (u as Utterance & { topicId?: string }).topicId === topicId
    );
  }

  getBySpeakerType(type: SpeakerType): Utterance[] {
    return this.getAll().filter((u) => u.speaker.type === type);
  }

  getBySpeakerId(speakerId: string): Utterance[] {
    return this.getAll().filter((u) => u.speaker.speakerId === speakerId);
  }

  getByUserId(userId: string): Utterance[] {
    return this.getAll().filter((u) => u.speaker.userId === userId);
  }

  getWithinTimeWindow(windowMs: number): Utterance[] {
    const now = Date.now();
    const cutoff = now - windowMs;

    return this.getAll().filter((u) => u.timestamp >= cutoff);
  }

  assembleContext(
    maxCharacters?: number,
    format?: (u: Utterance) => string
  ): string {
    const charLimit = maxCharacters || this.config.maxCharacters;
    const formatFn = format || this.defaultFormat;

    const utterances = this.getRecent(this.count);
    const lines: string[] = [];
    let totalChars = 0;

    for (let i = utterances.length - 1; i >= 0; i--) {
      const utterance = utterances[i];
      if (!utterance) {
        continue;
      }

      const formatted = formatFn(utterance);

      if (totalChars + formatted.length > charLimit) {
        break;
      }

      lines.unshift(formatted);
      totalChars += formatted.length + 1;
    }

    return lines.join("\n");
  }

  private defaultFormat(u: Utterance): string {
    const timestamp = new Date(u.timestamp).toLocaleTimeString();
    return `[${timestamp}] ${u.speaker.name}: ${u.text}`;
  }

  private evictOld(): void {
    if (this.count === 0) {
      return;
    }

    const now = Date.now();
    const cutoff = now - this.config.maxAgeMs;

    while (this.count > 0) {
      const oldest = this.buffer[this.tail];
      if (!oldest || oldest.timestamp >= cutoff) {
        break;
      }

      this.buffer[this.tail] = null;
      this.tail = (this.tail + 1) % this.config.maxSize;
      this.count--;
    }
  }

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

  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  isEmpty(): boolean {
    return this.count === 0;
  }

  isFull(): boolean {
    return this.count === this.config.maxSize;
  }
}
