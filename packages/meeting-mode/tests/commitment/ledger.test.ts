import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Redis as RedisClient } from "ioredis";
import Redis from "ioredis-mock";
import { TTL } from "../../../infra/redis/ttl";
import { ledgerChannel } from "../../src/channels";
import { CommitmentLedger } from "../../src/commitment/ledger";
import type { CommitmentStatus } from "../../src/commitment/types";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

describe("commitment/ledger", () => {
  let redis: RedisClient;
  let ledger: CommitmentLedger;

  const sessionId = "session-ledger";
  const snapshotKey = `meeting:ledger:${sessionId}`;

  const now = () => 1_700_000_000_000;

  const speakerAlice = createTeamSpeaker("user-alice", "Alice", {
    speakerId: "spk_alice",
  });

  const speakerBob = createTeamSpeaker("user-bob", "Bob", {
    speakerId: "spk_bob",
  });

  const externalSpeaker = createExternalSpeaker("Client", {
    speakerId: "spk_external",
  });

  beforeEach(() => {
    redis = new Redis() as unknown as RedisClient;
    ledger = new CommitmentLedger(redis, sessionId, {
      now,
      idFactory: mock(() => "commitment-fixed-id"),
    });
  });

  it("inserts commitments, writes snapshot, and publishes insert event", async () => {
    const publishSpy = mock(redis.publish.bind(redis));
    redis.publish = publishSpy as unknown as typeof redis.publish;

    const inserted = await ledger.insert({
      statement: "We can ship by Friday",
      speaker: speakerAlice,
      topicId: "topic-delivery",
      type: "timeline",
      timestamp: 100,
      utteranceId: "utt-1",
      embedding: [1, 0, 0],
      extractedData: { deadline: "2026-05-01" },
    });

    expect(inserted.id).toBe("commitment-fixed-id");
    expect(inserted.normalizedStatement).toBe("we can ship by friday");
    expect(inserted.status).toBe("tentative");
    expect(ledger.size()).toBe(1);

    const snapshotRaw = await redis.get(snapshotKey);
    expect(snapshotRaw).toBeTruthy();

    const snapshot = JSON.parse(snapshotRaw ?? "{}");
    expect(snapshot.sessionId).toBe(sessionId);
    expect(snapshot.version).toBe(1);
    expect(snapshot.commitments).toHaveLength(1);
    expect(snapshot.commitments[0]?.embedding).toBeUndefined();
    expect(snapshot.commitments[0]?.embeddingBase64).toBeTypeOf("string");

    const ttl = await redis.ttl(snapshotKey);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(TTL.COMMITMENT_LEDGER);

    expect(publishSpy).toHaveBeenCalledTimes(1);
    const [channel, payload] = publishSpy.mock.calls[0] ?? [];
    expect(channel).toBe(ledgerChannel(sessionId));

    const event = JSON.parse((payload as string) ?? "{}");
    expect(event.type).toBe("insert");
    expect(event.sessionId).toBe(sessionId);
    expect(event.commitment.embedding).toBeUndefined();
    expect(event.commitment.id).toBe("commitment-fixed-id");
  });

  it("searches by vector similarity and applies filters", async () => {
    await ledger.insert({
      id: "c1",
      statement: "Ship by Friday",
      speaker: speakerAlice,
      topicId: "delivery",
      type: "timeline",
      status: "tentative",
      timestamp: 10,
      utteranceId: "u1",
      embedding: [1, 0, 0],
    });

    await ledger.insert({
      id: "c2",
      statement: "Needs two engineers",
      speaker: speakerBob,
      topicId: "delivery",
      type: "resource",
      status: "confirmed",
      timestamp: 20,
      utteranceId: "u2",
      embedding: [0.8, 0.1, 0],
    });

    await ledger.insert({
      id: "c3",
      statement: "Budget unchanged",
      speaker: externalSpeaker,
      topicId: "pricing",
      type: "price",
      status: "tentative",
      timestamp: 30,
      utteranceId: "u3",
      embedding: [0, 1, 0],
    });

    const top = ledger.search([1, 0, 0], { k: 2 });
    expect(top).toHaveLength(2);
    expect(top[0]?.commitment.id).toBe("c1");
    expect(top[1]?.commitment.id).toBe("c2");

    const onlyTopicDelivery = ledger.search([1, 0, 0], {
      topicId: "delivery",
      statuses: ["confirmed"],
    });
    expect(onlyTopicDelivery).toHaveLength(1);
    expect(onlyTopicDelivery[0]?.commitment.id).toBe("c2");

    const crossSpeaker = ledger.searchCrossSpeaker([1, 0, 0], {
      speakerId: "spk_alice",
      topicId: "delivery",
      k: 5,
    });
    expect(crossSpeaker.find((match) => match.commitment.id === "c1")).toBe(
      undefined
    );
    expect(crossSpeaker.some((match) => match.commitment.id === "c2")).toBe(
      true
    );
  });

  it("applies allowed status transitions and relationship tracking", async () => {
    await ledger.insert({
      id: "c1",
      statement: "Ship by Friday",
      speaker: speakerAlice,
      topicId: "delivery",
      type: "timeline",
      status: "tentative",
      timestamp: 10,
      utteranceId: "u1",
      embedding: [1, 0],
    });

    const confirmed = await ledger.updateStatus("c1", {
      status: "confirmed",
      relatedCommitments: ["c0"],
    });
    expect(confirmed?.status).toBe("confirmed");
    expect(confirmed?.relatedCommitments).toEqual(["c0"]);

    const contradicted = await ledger.updateStatus("c1", {
      status: "contradicted",
      contradicts: "c0",
      relatedCommitments: ["c0", "c2"],
    });
    expect(contradicted?.status).toBe("contradicted");
    expect(contradicted?.contradicts).toBe("c0");
    expect(contradicted?.relatedCommitments.sort()).toEqual(["c0", "c2"]);

    await expect(
      ledger.updateStatus("c1", {
        status: "confirmed",
      })
    ).rejects.toThrow(
      "Invalid commitment status transition: contradicted -> confirmed"
    );
  });

  it("hydrates from snapshot and supports recovery search", async () => {
    await ledger.insert({
      id: "c1",
      statement: "Ship by Friday",
      speaker: speakerAlice,
      topicId: "delivery",
      type: "timeline",
      timestamp: 10,
      utteranceId: "u1",
      embedding: [1, 0, 0],
    });

    await ledger.insert({
      id: "c2",
      statement: "Need one designer",
      speaker: speakerBob,
      topicId: "delivery",
      type: "resource",
      timestamp: 20,
      utteranceId: "u2",
      embedding: [0.9, 0.1, 0],
    });

    const recovered = new CommitmentLedger(redis as unknown as any, sessionId, {
      now,
    });

    const hydration = await recovered.hydrateFromSnapshot();
    expect(hydration.loaded).toBe(2);
    expect(hydration.skipped).toBe(0);

    const matches = recovered.search([1, 0, 0], { k: 2 });
    expect(matches).toHaveLength(2);
    expect(matches[0]?.commitment.id).toBe("c1");
    expect(matches[1]?.commitment.id).toBe("c2");
  });

  it("skips malformed commitments during hydration", async () => {
    const malformedSnapshot = {
      version: 1,
      sessionId,
      savedAt: now(),
      commitments: [
        {
          id: "valid",
          statement: "Valid",
          normalizedStatement: "valid",
          speaker: speakerAlice,
          topicId: "delivery",
          type: "timeline",
          status: "tentative" as CommitmentStatus,
          timestamp: 1,
          utteranceId: "u-valid",
          relatedCommitments: [],
          embeddingBase64: Buffer.from(
            new Float32Array([1, 0]).buffer
          ).toString("base64"),
        },
        {
          id: "bad",
          statement: "Bad",
          embeddingBase64: "xyz", // invalid
        },
      ],
    };

    await redis.set(snapshotKey, JSON.stringify(malformedSnapshot));

    const hydration = await ledger.hydrateFromSnapshot();
    expect(hydration.loaded).toBe(1);
    expect(hydration.skipped).toBe(1);
    expect(ledger.size()).toBe(1);
  });

  it("drains and deletes snapshot on graceful session end", async () => {
    await ledger.insert({
      id: "c1",
      statement: "Ship by Friday",
      speaker: speakerAlice,
      topicId: "delivery",
      type: "timeline",
      timestamp: 10,
      utteranceId: "u1",
      embedding: [1, 0],
    });

    const drained = await ledger.closeAndDeleteSnapshot();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.id).toBe("c1");
    expect(ledger.size()).toBe(0);
    expect(await redis.get(snapshotKey)).toBeNull();
  });
});
