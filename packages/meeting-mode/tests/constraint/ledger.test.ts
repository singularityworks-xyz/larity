import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { TTL } from "@larity/infra/redis/ttl";
import type { Redis as RedisClient } from "ioredis";
import Redis from "ioredis-mock";
import { constraintChannel } from "../../src/channels";
import { ConstraintLedger } from "../../src/constraint/ledger";
import { createTeamSpeaker } from "../helpers";

describe("constraint/ledger", () => {
  let redis: RedisClient;
  let ledger: ConstraintLedger;

  const sessionId = "session-constraint-ledger";
  const snapshotKey = `meeting:constraint:${sessionId}`;

  beforeEach(() => {
    redis = new Redis() as unknown as RedisClient;
    ledger = new ConstraintLedger(redis, sessionId, {
      now: () => 1_700_000_000_000,
      idFactory: mock(() => "constraint-fixed-id"),
    });
  });

  afterEach(() => {
    redis.quit();
  });

  it("inserts constraints, writes snapshot, and publishes event", async () => {
    const publishSpy = mock(redis.publish.bind(redis));
    redis.publish = publishSpy as unknown as typeof redis.publish;

    const inserted = await ledger.insert({
      type: "date",
      value: "Deadline is 05/01/2026",
      source: "meeting",
      utteranceId: "utt-1",
      speaker: createTeamSpeaker("user-alice", "Alice"),
      confidence: 0.74,
      topicIds: ["topic-1"],
    });

    expect(inserted.id).toBe("constraint-fixed-id");
    expect(ledger.size()).toBe(1);

    const snapshotRaw = await redis.get(snapshotKey);
    expect(snapshotRaw).toBeTruthy();

    const snapshot = JSON.parse(snapshotRaw ?? "{}");
    expect(snapshot.version).toBe(1);
    expect(snapshot.sessionId).toBe(sessionId);
    expect(snapshot.constraints).toHaveLength(1);

    const ttl = await redis.ttl(snapshotKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL.CONSTRAINT_LEDGER);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishSpy.mock.calls[0] ?? [];
    expect(channel).toBe(constraintChannel(sessionId));

    const event = JSON.parse((payload as string) ?? "{}");
    expect(event.type).toBe("insert");
    expect(event.constraint.id).toBe("constraint-fixed-id");
  });

  it("applies delta merge for duplicate normalized constraints", async () => {
    await ledger.insert({
      id: "c1",
      type: "capacity",
      value: "Capacity capped at 60%.",
      source: "preloaded",
      confidence: 0.6,
      topicIds: ["topic-a"],
    });

    const merged = await ledger.insert({
      id: "c2",
      type: "capacity",
      value: "  capacity capped at 60%  ",
      source: "meeting",
      confidence: 0.8,
      topicIds: ["topic-b"],
    });

    expect(ledger.size()).toBe(1);
    expect(merged.id).toBe("c1");
    expect(merged.confidence).toBe(0.8);
    expect(merged.topicIds.sort()).toEqual(["topic-a", "topic-b"]);
  });

  it("hydrates from snapshot and skips malformed records", async () => {
    await redis.set(
      snapshotKey,
      JSON.stringify({
        version: 1,
        sessionId,
        savedAt: Date.now(),
        constraints: [
          {
            id: "good",
            type: "policy",
            value: "Follow NDA terms",
            source: "preloaded",
            confidence: 0.9,
            topicIds: [],
          },
          {
            id: "bad",
            value: "missing type and source",
          },
        ],
      })
    );

    const hydration = await ledger.hydrateFromSnapshot();
    expect(hydration.loaded).toBe(1);
    expect(hydration.skipped).toBe(1);
    expect(ledger.size()).toBe(1);
  });
});
