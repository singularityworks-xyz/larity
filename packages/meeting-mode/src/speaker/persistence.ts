import type { Redis } from "ioredis";
import { redisKeys } from "../../../infra/redis/keys";
import { TTL } from "../../../infra/redis/ttl";
import { createMeetingModeLogger } from "../logger";
import type { SpeakerMapping } from "./types";

const log = createMeetingModeLogger("speaker-persistence");

export class SpeakerPersistence {
  private readonly redis: Redis;
  private readonly sessionId: string;
  private readonly key: string;

  constructor(redis: Redis, sessionId: string) {
    this.redis = redis;
    this.sessionId = sessionId;
    this.key = redisKeys.meetingSpeaker(sessionId);
  }

  async saveMapping(mapping: SpeakerMapping): Promise<void> {
    try {
      await this.redis.hset(
        this.key,
        mapping.diarizationIndex.toString(),
        JSON.stringify(mapping)
      );
      await this.redis.expire(this.key, TTL.SPEAKER_STATE);
    } catch (err) {
      log.error(
        { err, sessionId: this.sessionId },
        "Failed to save speaker mapping to Redis"
      );
    }
  }

  async loadMappings(): Promise<Map<number, SpeakerMapping>> {
    const mappings = new Map<number, SpeakerMapping>();
    try {
      const data = await this.redis.hgetall(this.key);
      for (const [indexStr, json] of Object.entries(data)) {
        try {
          const index = Number.parseInt(indexStr, 10);
          const mapping = JSON.parse(json) as SpeakerMapping;
          mappings.set(index, mapping);
        } catch {
          log.warn(
            { key: this.key, indexStr },
            "Invalid speaker mapping JSON in Redis"
          );
        }
      }
    } catch (err) {
      log.error(
        { err, sessionId: this.sessionId },
        "Failed to load speaker mappings from Redis"
      );
    }
    return mappings;
  }
}
