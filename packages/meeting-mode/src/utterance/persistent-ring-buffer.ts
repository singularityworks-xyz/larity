import type { Redis } from "ioredis";
import { createMeetingModeLogger } from "../../logger";
import { RingBuffer, type RingBufferConfig } from "./ring-buffer";
import type { Utterance } from "./types";

const log = createMeetingModeLogger("persistent-ring-buffer");

/**
 * Redis key for buffer persistence
 */
function bufferKey(sessionId: string): string {
  return `meeting.ringbuffer.${sessionId}`;
}

/**
 * Persistent Ring Buffer
 *
 * Extends RingBuffer with Redis persistence.
 * Periodically saves state to Redis for recovery.
 *
 * Use cases:
 * - Service restart recovery
 * - Multi-instance synchronization
 * - Debugging/replay
 */
export class PersistentRingBuffer extends RingBuffer {
  private readonly redis: Redis;
  private readonly sessionId: string;
  private saveInterval: NodeJS.Timeout | null = null;
  private pendingSave = false;
  private lastSaveTime = 0;

  /** Minimum interval between saves (ms) */
  private readonly SAVE_INTERVAL = 5000; // 5 seconds

  /** TTL for persisted data (seconds) */
  private readonly PERSIST_TTL = 3600; // 1 hour

  constructor(
    redis: Redis,
    sessionId: string,
    config?: Partial<RingBufferConfig>
  ) {
    super(config);
    this.redis = redis;
    this.sessionId = sessionId;
  }

  /**
   * Push and schedule save
   */
  override push(utterance: Utterance): void {
    super.push(utterance);
    this.scheduleSave();
  }

  /**
   * Load buffer state from Redis
   *
   * Call this when recovering a session.
   */
  async load(): Promise<boolean> {
    try {
      const key = bufferKey(this.sessionId);
      const data = await this.redis.get(key);

      if (!data) {
        return false;
      }

      const parsed = JSON.parse(data) as {
        utterances: Utterance[];
        savedAt: number;
      };

      // Only load if data is recent (within TTL)
      const age = Date.now() - parsed.savedAt;
      if (age > this.PERSIST_TTL * 1000) {
        await this.redis.del(key);
        return false;
      }

      // Load utterances into buffer
      this.clear();
      for (const utterance of parsed.utterances) {
        super.push(utterance);
      }

      log.info(
        {
          sessionId: this.sessionId,
          count: parsed.utterances.length,
        },
        "Loaded utterances from Redis"
      );

      return true;
    } catch (error) {
      log.error({ err: error, sessionId: this.sessionId }, "Load error");
      return false;
    }
  }

  /**
   * Save buffer state to Redis
   */
  async save(): Promise<void> {
    try {
      const utterances = this.getAll();
      const key = bufferKey(this.sessionId);

      const data = JSON.stringify({
        utterances,
        savedAt: Date.now(),
      });

      await this.redis.setex(key, this.PERSIST_TTL, data);
      this.lastSaveTime = Date.now();
      this.pendingSave = false;

      log.debug(
        {
          sessionId: this.sessionId,
          count: utterances.length,
        },
        "Saved utterances to Redis"
      );
    } catch (error) {
      log.error({ err: error, sessionId: this.sessionId }, "Save error");
    }
  }

  /**
   * Schedule a save (debounced)
   */
  private scheduleSave(): void {
    if (this.pendingSave) {
      return; // Already scheduled
    }

    const timeSinceLastSave = Date.now() - this.lastSaveTime;

    if (timeSinceLastSave >= this.SAVE_INTERVAL) {
      // Save immediately
      this.save();
    } else {
      // Schedule for later
      this.pendingSave = true;
      setTimeout(() => {
        this.save();
      }, this.SAVE_INTERVAL - timeSinceLastSave);
    }
  }

  /**
   * Start periodic saves
   */
  startPeriodicSave(intervalMs = 30_000): void {
    this.stopPeriodicSave();
    this.saveInterval = setInterval(() => {
      if (!this.isEmpty()) {
        this.save();
      }
    }, intervalMs);
  }

  /**
   * Stop periodic saves
   */
  stopPeriodicSave(): void {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }

  /**
   * Delete persisted data
   */
  async deletePersisted(): Promise<void> {
    const key = bufferKey(this.sessionId);
    await this.redis.del(key);
  }

  /**
   * Cleanup on session end
   */
  async cleanup(): Promise<void> {
    this.stopPeriodicSave();

    // Final save before cleanup
    if (!this.isEmpty()) {
      await this.save();
    }
  }
}
