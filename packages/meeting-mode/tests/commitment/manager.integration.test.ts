import { describe, expect, it } from "bun:test";
import type { Redis as RedisClient } from "ioredis";
import Redis from "ioredis-mock";
import { CommitmentManager } from "../../src/commitment/manager";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

describe("commitment/manager integration", () => {
  it("supports insert -> search -> status update -> hydrate recovery lifecycle", async () => {
    const redis = new Redis() as unknown as RedisClient;
    const sessionId = "session-42";

    const manager = new CommitmentManager(redis, {
      now: () => 1_700_000_001_000,
    });

    const alice = createTeamSpeaker("user-alice", "Alice", {
      speakerId: "spk_alice",
    });
    const raj = createTeamSpeaker("user-raj", "Raj", {
      speakerId: "spk_raj",
    });
    const client = createExternalSpeaker("Client", {
      speakerId: "spk_client",
    });

    const aliceCommitment = await manager.addCommitment(sessionId, {
      id: "c-alice",
      statement: "We can deliver in 2 weeks",
      speaker: alice,
      topicId: "timeline",
      type: "timeline",
      timestamp: 100,
      utteranceId: "utt-a",
      embedding: [1, 0, 0],
    });

    const rajCommitment = await manager.addCommitment(sessionId, {
      id: "c-raj",
      statement: "This may take 2 months",
      speaker: raj,
      topicId: "timeline",
      type: "timeline",
      timestamp: 140,
      utteranceId: "utt-r",
      embedding: [0.97, 0.02, 0],
    });

    await manager.addCommitment(sessionId, {
      id: "c-client",
      statement: "Keep budget fixed",
      speaker: client,
      topicId: "pricing",
      type: "price",
      timestamp: 200,
      utteranceId: "utt-c",
      embedding: [0, 1, 0],
    });

    const teamMatches = manager.searchCrossSpeaker(sessionId, [1, 0, 0], {
      speakerId: alice.speakerId,
      topicId: "timeline",
      type: "timeline",
      minSimilarity: 0.8,
      k: 3,
    });

    expect(teamMatches.some((match) => match.commitment.id === "c-raj")).toBe(
      true
    );
    expect(teamMatches.some((match) => match.commitment.id === "c-alice")).toBe(
      false
    );

    const updated = await manager.updateStatus(sessionId, rajCommitment.id, {
      status: "contradicted",
      contradicts: aliceCommitment.id,
      relatedCommitments: [aliceCommitment.id],
    });

    expect(updated?.status).toBe("contradicted");
    expect(updated?.contradicts).toBe("c-alice");

    const recoveringManager = new CommitmentManager(redis);
    const hydration = await recoveringManager.hydrateSession(sessionId);
    expect(hydration.loaded).toBe(3);
    expect(hydration.skipped).toBe(0);

    const recoveredMatches = recoveringManager.search(sessionId, [1, 0, 0], {
      statuses: ["contradicted"],
      k: 5,
    });

    expect(recoveredMatches).toHaveLength(1);
    expect(recoveredMatches[0]?.commitment.id).toBe("c-raj");

    const drained =
      await recoveringManager.endSessionAndDeleteSnapshot(sessionId);
    expect(drained).toHaveLength(3);
    expect(await redis.get(`meeting:ledger:${sessionId}`)).toBeNull();
    redis.quit();
  });
});
