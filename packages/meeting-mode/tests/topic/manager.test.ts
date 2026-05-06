import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { TopicPublisher } from "../../src/topic/manager";
import { TopicManager } from "../../src/topic/manager";
import { createTestUtterance } from "../helpers";

const TOPIC_PREFIX = /^topic_session-1_/;

// Mock the internal classes
mock.module("../../src/topic/embedder", () => {
  return {
    GoogleGenAIEmbedder: class {
      async embed(text: string) {
        await Promise.resolve();
        if (text.includes("sports")) {
          return [1, 0, 0];
        }
        if (text.includes("finance")) {
          return [0, 1, 0];
        }
        return [0, 0, 1]; // default topic
      }
    },
  };
});

mock.module("../../src/topic/summarizer", () => {
  return {
    TopicSummarizer: class {
      async summarize(_currentState: any, newUtterances: string[]) {
        await Promise.resolve();
        return {
          label: "Mocked Label",
          summary: `Mocked summary of ${newUtterances.length} utterances.`,
          completeness: {
            hasOwner: true,
            hasDeadline: false,
            hasActionItems: false,
            actionItems: [],
            hasExplicitConfirmation: false,
          },
        };
      }
    },
  };
});

function createMockPublisher(): TopicPublisher & {
  calls: Array<{ channel: string; message: string }>;
  hsetCalls: Array<{ key: string; field: string; value: string }>;
} {
  const calls: Array<{ channel: string; message: string }> = [];
  const hsetCalls: Array<{ key: string; field: string; value: string }> = [];
  return {
    calls,
    hsetCalls,
    publish: mock(async (channel: string, message: string) => {
      await Promise.resolve();
      calls.push({ channel, message });
      return 1;
    }),
    hset: mock(async (key: string, field: string, value: string) => {
      await Promise.resolve();
      hsetCalls.push({ key, field, value });
      return 1;
    }),
  };
}

describe("TopicManager", () => {
  let publisher: ReturnType<typeof createMockPublisher>;
  let manager: TopicManager;

  beforeEach(() => {
    publisher = createMockPublisher();
    manager = new TopicManager(publisher);
  });

  describe("assignTopic", () => {
    it("should spawn a new topic if none exist", async () => {
      const utterance = createTestUtterance({
        sessionId: "session-1",
        text: "Let's talk about sports.",
      });

      const topicId = await manager.assignTopic(utterance);
      expect(topicId).toMatch(TOPIC_PREFIX);
    });

    it("should group similar utterances into the same topic", async () => {
      const u1 = createTestUtterance({
        sessionId: "s-1",
        text: "sports are great",
      });
      const u2 = createTestUtterance({
        sessionId: "s-1",
        text: "more sports talk",
      });

      const topicId1 = await manager.assignTopic(u1);
      const topicId2 = await manager.assignTopic(u2);

      expect(topicId1).toBe(topicId2);
    });

    it("should split dissimilar utterances into different topics", async () => {
      const u1 = createTestUtterance({
        sessionId: "s-1",
        text: "sports are great",
      });
      const u2 = createTestUtterance({
        sessionId: "s-1",
        text: "let's talk finance now",
      });

      const topicId1 = await manager.assignTopic(u1);
      const topicId2 = await manager.assignTopic(u2);

      expect(topicId1).not.toBe(topicId2);
    });
  });

  describe("summarization triggers", () => {
    it("should trigger summarization on session close", async () => {
      const u1 = createTestUtterance({
        sessionId: "s-1",
        text: "sports are great",
      });
      const topicId = await manager.assignTopic(u1);

      // New topics are published immediately (fire-and-forget, need a tick)
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(publisher.calls).toHaveLength(1);
      expect(publisher.hsetCalls).toHaveLength(1);

      const initialJson = JSON.parse(publisher.calls[0]?.message ?? "{}");
      expect(initialJson.topicId).toBe(topicId);
      expect(initialJson.label).toBe("sports are great");

      // Clear call log before testing session close
      publisher.calls.length = 0;
      publisher.hsetCalls.length = 0;

      // Close session should flush pending utterances
      await manager.closeSession("s-1");

      // Should have published the updated state
      expect(publisher.calls).toHaveLength(1);
      expect(publisher.hsetCalls).toHaveLength(1);

      const publishedJson = JSON.parse(publisher.calls[0]?.message ?? "{}");
      expect(publishedJson.topicId).toBe(topicId);
      expect(publishedJson.label).toBe("Mocked Label");
    });
  });
});
