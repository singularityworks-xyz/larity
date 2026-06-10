import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { Redis as RedisClient } from "ioredis";
import Redis from "ioredis-mock";
import { ConstraintManager } from "../../src/constraint/manager";
import { createTeamSpeaker, createTestUtterance } from "../helpers";

describe("constraint/manager", () => {
  let redis: RedisClient;
  let manager: ConstraintManager;
  const sessionId = "session-constraint-manager";

  beforeEach(() => {
    redis = new Redis() as unknown as RedisClient;
    manager = new ConstraintManager(redis, {
      now: () => 1_700_000_000_000,
      snapshotDebounceMs: 0,
    });
  });

  afterEach(async () => {
    await redis.quit();
  });

  it("hydrates constraints from preloaded context payload", async () => {
    await redis.set(
      `meeting:context:${sessionId}`,
      JSON.stringify({
        version: 1,
        sessionId,
        meetingId: "meeting-1",
        clientId: "client-1",
        orgId: "org-1",
        loadedAt: Date.now(),
        openDecisions: [
          {
            id: "decision-1",
            title: "Delivery",
            content: "Must ship by May 15",
            tags: ["timeline"],
            createdAt: Date.now(),
          },
        ],
        knownConstraints: [
          {
            id: "constraint-1",
            content: "Capacity capped at 60%",
            createdAt: Date.now(),
          },
        ],
        activePolicyGuardrails: [
          {
            id: "guardrail-1",
            name: "NDA",
            description: "No roadmap disclosures",
            ruleType: "NDA",
            severity: "WARNING",
            keywords: ["roadmap"],
            pattern: "confidential",
            clientId: null,
          },
        ],
        priorCommitments: [],
        clientNameList: ["Acme Corp"],
        keywordBlocklists: ["internal roadmap"],
        calendarAgendaItems: ["Timeline"],
      })
    );

    const hydration = await manager.hydrateSession(sessionId);
    expect(hydration.loaded).toBe(4);
    expect(manager.getAll(sessionId).length).toBe(4);
  });

  it("detects structural constraints from utterances and dedupes duplicates", async () => {
    await redis.set(
      `meeting:context:${sessionId}`,
      JSON.stringify({
        version: 1,
        sessionId,
        meetingId: "meeting-1",
        clientId: "client-1",
        orgId: "org-1",
        loadedAt: Date.now(),
        openDecisions: [],
        knownConstraints: [],
        activePolicyGuardrails: [],
        priorCommitments: [],
        clientNameList: [],
        keywordBlocklists: [],
        calendarAgendaItems: [],
      })
    );

    const speaker = createTeamSpeaker("user-alice", "Alice");

    const first = await manager.processUtterance(
      createTestUtterance({
        sessionId,
        speaker,
        topicId: "timeline",
        text: "We must deliver by 05/01/2026 and capacity is limited to 60%.",
      })
    );

    expect(first.inserted.length).toBe(2);
    expect(first.inserted.some((item) => item.type === "date")).toBe(true);
    expect(first.inserted.some((item) => item.type === "capacity")).toBe(true);

    const second = await manager.processUtterance(
      createTestUtterance({
        sessionId,
        speaker,
        topicId: "timeline",
        text: "We must deliver by 05/01/2026 and capacity is limited to 60%.",
      })
    );

    expect(second.inserted).toHaveLength(0);
    expect(second.skipped).toHaveLength(2);
  });
});
