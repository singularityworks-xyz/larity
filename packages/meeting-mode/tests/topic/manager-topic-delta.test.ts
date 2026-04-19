import { describe, expect, it, mock } from "bun:test";
import type { TopicPublisher } from "../../src/topic/manager";
import { TopicManager } from "../../src/topic/manager";
import { createTestUtterance } from "../helpers";

mock.module("../../src/topic/embedder", () => {
  return {
    GoogleGenAIEmbedder: class {
      embed() {
        return Promise.resolve([1, 0, 0]);
      }
    },
  };
});

mock.module("../../src/topic/summarizer", () => {
  return {
    TopicSummarizer: class {
      summarize() {
        return Promise.resolve({
          label: "Ignored",
          summary: "Ignored",
          completeness: {
            hasOwner: false,
            hasDeadline: false,
            hasActionItems: false,
            actionItems: [],
            hasExplicitConfirmation: false,
          },
        });
      }
    },
  };
});

function createPublisher(): TopicPublisher {
  return {
    publish: mock(() => Promise.resolve(1)),
    hset: mock(() => Promise.resolve(1)),
  };
}

describe("topic/manager tier2 topic delta", () => {
  it("applies topicDelta deterministically without summarizer", async () => {
    const manager = new TopicManager(createPublisher(), {
      enableAsyncSummarization: false,
    });

    const utterance = createTestUtterance({
      sessionId: "session-topic-delta",
      text: "Discussing timeline commitments",
    });

    const topicId = await manager.assignTopic(utterance);

    await manager.applyTier2TopicDelta("session-topic-delta", topicId, {
      labelHint: "Delivery Timeline",
      commitment: "Ship MVP by June 1",
      risk: "Timeline is aggressive",
      openQuestion: "Who will own QA?",
      owner: "Alice",
      deadline: "2026-06-01",
    });

    const topics = manager.getTopics("session-topic-delta");
    const topic = topics.find((item) => item.topicId === topicId);

    expect(topic?.label).toBe("Delivery Timeline");
    expect(topic?.summary).toContain("Commitment: Ship MVP by June 1");
    expect(topic?.summary).toContain("Risk: Timeline is aggressive");
    expect(topic?.completeness.hasOwner).toBe(true);
    expect(topic?.completeness.ownerName).toBe("Alice");
    expect(topic?.completeness.hasDeadline).toBe(true);
    expect(topic?.completeness.deadline).toBe("2026-06-01");
    expect(topic?.completeness.actionItems).toContain("Who will own QA?");
    expect(topic?.commitmentsMentioned.length).toBe(1);
    expect(topic?.riskFlags.length).toBe(1);
  });
});
