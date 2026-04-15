import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import Redis from "ioredis-mock";
import { redisKeys } from "../../../infra/redis/keys";
import { SpeakerPersistence } from "../../src/speaker/persistence";
import type { SpeakerMapping } from "../../src/speaker/types";

describe("SpeakerPersistence", () => {
  let redis: any;
  let persistence: SpeakerPersistence;
  const sessionId = "test-session";
  const key = redisKeys.meetingSpeaker(sessionId);

  beforeEach(() => {
    redis = new Redis();
    persistence = new SpeakerPersistence(redis, sessionId);
  });

  afterEach(() => {
    redis.flushall();
  });

  const generateMapping = (index: number): SpeakerMapping => ({
    diarizationIndex: index,
    speaker: {
      speakerId: `spk_${index}`,
      type: "TEAM",
      userId: `user_${index}`,
      name: `User ${index}`,
      diarizationIndex: index,
      isCurrentUser: false,
      confidence: 1,
    },
    confirmedAt: Date.now(),
    confidence: 1,
  });

  it("should securely save and load mappings from Redis hash", async () => {
    const mapping1 = generateMapping(1);
    const mapping2 = generateMapping(2);

    await persistence.saveMapping(mapping1);
    await persistence.saveMapping(mapping2);

    const mappings = await persistence.loadMappings();

    expect(mappings.size).toBe(2);
    expect(mappings.get(1)).toEqual(mapping1);
    expect(mappings.get(2)).toEqual(mapping2);
  });

  it("should handle corrupted JSON data gracefully", async () => {
    const mapping1 = generateMapping(1);
    await persistence.saveMapping(mapping1);

    // Corrupt one entry manually
    await redis.hset(key, "2", "invalid-json}");

    const mappings = await persistence.loadMappings();

    expect(mappings.size).toBe(1);
    expect(mappings.has(2)).toBe(false);
    expect(mappings.get(1)).toEqual(mapping1);
  });

  it("should return an empty map if no session exists", async () => {
    const mappings = await persistence.loadMappings();
    expect(mappings.size).toBe(0);
  });
});
