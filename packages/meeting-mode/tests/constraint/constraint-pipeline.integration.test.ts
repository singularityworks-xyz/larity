import type { Redis as RedisClient } from "ioredis";
import Redis from "ioredis-mock";
import { describe, expect, it, vi } from "vitest";
import { ConstraintManager } from "../../src/constraint/manager";
import type { UtterancePublisher } from "../../src/utterance/finalizer";
import { UtteranceFinalizer } from "../../src/utterance/finalizer";
import { createTestSttResult, resetUtteranceSeq } from "../helpers";

vi.mock("../../src/topic/embedder", () => {
  return {
    GoogleGenAIEmbedder: vi.fn().mockImplementation(() => {
      return {
        embed: vi.fn().mockResolvedValue(new Array(768).fill(0)),
      };
    }),
  };
});

vi.mock("../../src/topic/summarizer", () => {
  return {
    TopicSummarizer: vi.fn().mockImplementation(() => {
      return {
        summarize: vi.fn().mockResolvedValue({
          summary: "Mock summary",
          actionItems: [],
        }),
      };
    }),
  };
});

describe("constraint pipeline integration", () => {
  it("hydrates preloaded context and persists live constraints from published utterances", async () => {
    const redis = new Redis() as unknown as RedisClient;
    const publishSpy = vi.spyOn(redis, "publish");
    const sessionId = "constraint-pipeline-session";

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
            title: "Timeline",
            content: "Delivery before May 15",
            tags: ["timeline"],
            createdAt: Date.now(),
          },
        ],
        knownConstraints: [],
        activePolicyGuardrails: [],
        priorCommitments: [],
        clientNameList: ["Acme Corp"],
        keywordBlocklists: ["internal roadmap"],
        calendarAgendaItems: ["Timeline"],
      })
    );

    const publisherCalls: Array<{ channel: string; message: string }> = [];

    const publisher: UtterancePublisher = {
      publish: vi.fn((channel, message) => {
        publisherCalls.push({ channel, message });
        return Promise.resolve(1);
      }),
      hset: vi.fn(() => Promise.resolve(1)),
    };

    const finalizer = new UtteranceFinalizer(publisher);
    const constraintManager = new ConstraintManager(redis);

    finalizer.onUtterancePublished(async (utterance) => {
      await constraintManager.processUtterance(utterance);
    });

    resetUtteranceSeq();
    await finalizer.process(
      createTestSttResult({
        sessionId,
        diarizationIndex: 0,
        transcript:
          "We can only commit up to 60% capacity and must deliver by 05/15/2026.",
      })
    );

    await finalizer.process(
      createTestSttResult({
        sessionId,
        diarizationIndex: 1,
        transcript: "Acknowledged.",
      })
    );

    await finalizer.closeSession(sessionId);

    const snapshotRaw = await redis.get(`meeting:constraint:${sessionId}`);
    expect(snapshotRaw).toBeTruthy();

    const snapshot = JSON.parse(snapshotRaw ?? "{}");
    expect(Array.isArray(snapshot.constraints)).toBe(true);
    expect(
      snapshot.constraints.some((item: { source: string }) => {
        return item.source === "preloaded";
      })
    ).toBe(true);
    expect(
      snapshot.constraints.some((item: { source: string; type: string }) => {
        return item.source === "meeting" && item.type === "date";
      })
    ).toBe(true);
    expect(
      snapshot.constraints.some((item: { source: string; type: string }) => {
        return item.source === "meeting" && item.type === "capacity";
      })
    ).toBe(true);

    const publishedConstraintEvents = publishSpy.mock.calls.filter(
      ([channel]) => channel === `meeting.constraint.${sessionId}`
    );
    expect(publishedConstraintEvents.length).toBeGreaterThan(0);
  });
});
