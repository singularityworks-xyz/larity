import { beforeEach, describe, expect, it } from "vitest";
import { RingBuffer } from "../../src/utterance/ring-buffer";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestUtterance,
  resetUtteranceSeq,
} from "../helpers";

describe("RingBuffer", () => {
  let buffer: RingBuffer;

  beforeEach(() => {
    buffer = new RingBuffer({ maxSize: 10, maxAgeMs: 120_000 });
    resetUtteranceSeq();
  });

  describe("push and getAll", () => {
    it("should start empty", () => {
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.getAll()).toEqual([]);
    });

    it("should store pushed utterances", () => {
      const u = createTestUtterance();
      buffer.push(u);

      expect(buffer.isEmpty()).toBe(false);
      expect(buffer.getAll()).toHaveLength(1);
      expect(buffer.getAll()[0]).toBe(u);
    });

    it("should maintain insertion order", () => {
      const u1 = createTestUtterance({ text: "first" });
      const u2 = createTestUtterance({ text: "second" });
      const u3 = createTestUtterance({ text: "third" });

      buffer.push(u1);
      buffer.push(u2);
      buffer.push(u3);

      const all = buffer.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]?.text).toBe("first");
      expect(all[1]?.text).toBe("second");
      expect(all[2]?.text).toBe("third");
    });
  });

  describe("getRecent", () => {
    it("should return N most recent utterances", () => {
      for (let i = 0; i < 5; i++) {
        buffer.push(createTestUtterance({ text: `msg-${i}` }));
      }

      const recent = buffer.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0]?.text).toBe("msg-2");
      expect(recent[1]?.text).toBe("msg-3");
      expect(recent[2]?.text).toBe("msg-4");
    });

    it("should return all if N exceeds count", () => {
      buffer.push(createTestUtterance());
      buffer.push(createTestUtterance());

      const recent = buffer.getRecent(10);
      expect(recent).toHaveLength(2);
    });

    it("should return empty for empty buffer", () => {
      expect(buffer.getRecent(5)).toEqual([]);
    });
  });

  describe("eviction on maxSize", () => {
    it("should evict oldest when buffer is full", () => {
      const small = new RingBuffer({ maxSize: 3, maxAgeMs: 120_000 });

      const u1 = createTestUtterance({ text: "old" });
      const u2 = createTestUtterance({ text: "mid" });
      const u3 = createTestUtterance({ text: "new" });
      const u4 = createTestUtterance({ text: "newest" });

      small.push(u1);
      small.push(u2);
      small.push(u3);
      expect(small.isFull()).toBe(true);

      small.push(u4);
      const all = small.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]?.text).toBe("mid");
      expect(all[2]?.text).toBe("newest");
    });
  });

  describe("getBySpeakerType", () => {
    it("should filter by TEAM type", () => {
      const teamSpeaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const extSpeaker = createExternalSpeaker("Client", {
        speakerId: "spk_1",
      });

      buffer.push(createTestUtterance({ speaker: teamSpeaker, text: "team" }));
      buffer.push(createTestUtterance({ speaker: extSpeaker, text: "ext" }));
      buffer.push(createTestUtterance({ speaker: teamSpeaker, text: "team2" }));

      const team = buffer.getBySpeakerType("TEAM");
      expect(team).toHaveLength(2);
      expect(team[0]?.text).toBe("team");
      expect(team[1]?.text).toBe("team2");
    });

    it("should filter by EXTERNAL type", () => {
      const teamSpeaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const extSpeaker = createExternalSpeaker("Client", {
        speakerId: "spk_1",
      });

      buffer.push(createTestUtterance({ speaker: teamSpeaker, text: "team" }));
      buffer.push(createTestUtterance({ speaker: extSpeaker, text: "ext" }));

      const external = buffer.getBySpeakerType("EXTERNAL");
      expect(external).toHaveLength(1);
      expect(external[0]?.text).toBe("ext");
    });

    it("should return empty when no matches", () => {
      const ext = createExternalSpeaker("Client", { speakerId: "spk_0" });
      buffer.push(createTestUtterance({ speaker: ext }));

      expect(buffer.getBySpeakerType("TEAM")).toEqual([]);
    });
  });

  describe("getBySpeakerId", () => {
    it("should filter by specific speakerId", () => {
      const s1 = createExternalSpeaker("Alice", { speakerId: "spk_0" });
      const s2 = createExternalSpeaker("Bob", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: s1, text: "from-alice" }));
      buffer.push(createTestUtterance({ speaker: s2, text: "from-bob" }));
      buffer.push(createTestUtterance({ speaker: s1, text: "from-alice-2" }));

      const results = buffer.getBySpeakerId("spk_0");
      expect(results).toHaveLength(2);
      expect(results[0]?.text).toBe("from-alice");
      expect(results[1]?.text).toBe("from-alice-2");
    });

    it("should return empty for unknown speakerId", () => {
      buffer.push(createTestUtterance());
      expect(buffer.getBySpeakerId("spk_unknown")).toEqual([]);
    });
  });

  describe("getByUserId", () => {
    it("should filter by userId for team members", () => {
      const team = createTeamSpeaker("user-abc", "Alice", {
        speakerId: "spk_0",
      });
      const ext = createExternalSpeaker("Client", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: team, text: "team" }));
      buffer.push(createTestUtterance({ speaker: ext, text: "ext" }));

      const results = buffer.getByUserId("user-abc");
      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe("team");
    });

    it("should return empty when no userId matches", () => {
      const ext = createExternalSpeaker("Client", { speakerId: "spk_0" });
      buffer.push(createTestUtterance({ speaker: ext }));

      expect(buffer.getByUserId("user-xyz")).toEqual([]);
    });
  });

  describe("getWithinTimeWindow", () => {
    it("should return utterances within the time window", () => {
      const now = Date.now();
      buffer.push(
        createTestUtterance({ text: "old", timestamp: now - 60_000 })
      );
      buffer.push(
        createTestUtterance({ text: "recent", timestamp: now - 5000 })
      );
      buffer.push(createTestUtterance({ text: "now", timestamp: now }));

      const recent = buffer.getWithinTimeWindow(10_000);
      expect(recent).toHaveLength(2);
      expect(recent[0]?.text).toBe("recent");
      expect(recent[1]?.text).toBe("now");
    });
  });

  describe("getByTopic", () => {
    it("should filter by topicId", () => {
      buffer.push(
        createTestUtterance({ topicId: "topic-1", text: "on-topic" })
      );
      buffer.push(
        createTestUtterance({ topicId: "topic-2", text: "other-topic" })
      );
      buffer.push(createTestUtterance({ text: "no-topic" }));

      const results = buffer.getByTopic("topic-1");
      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe("on-topic");
    });
  });

  describe("assembleContext", () => {
    it("should format utterances with speaker name", () => {
      const speaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      buffer.push(
        createTestUtterance({
          speaker,
          text: "Hello everyone.",
          timestamp: Date.now(),
        })
      );

      const context = buffer.assembleContext();
      expect(context).toContain("Alice");
      expect(context).toContain("Hello everyone.");
    });

    it("should respect character limit", () => {
      for (let i = 0; i < 10; i++) {
        buffer.push(
          createTestUtterance({ text: "A".repeat(100), timestamp: Date.now() })
        );
      }

      const context = buffer.assembleContext(250);
      expect(context.length).toBeLessThanOrEqual(250);
    });

    it("should prioritize recent utterances", () => {
      const now = Date.now();
      buffer.push(
        createTestUtterance({ text: "old message", timestamp: now - 10_000 })
      );
      buffer.push(createTestUtterance({ text: "new message", timestamp: now }));

      // Limit to fit only one
      const context = buffer.assembleContext(80);
      expect(context).toContain("new message");
    });
  });

  describe("getStats", () => {
    it("should return correct stats", () => {
      const now = Date.now();
      buffer.push(
        createTestUtterance({ text: "hello", timestamp: now - 5000 })
      );
      buffer.push(createTestUtterance({ text: "world", timestamp: now }));

      const stats = buffer.getStats();
      expect(stats.count).toBe(2);
      expect(stats.maxSize).toBe(10);
      expect(stats.oldestTimestamp).toBe(now - 5000);
      expect(stats.newestTimestamp).toBe(now);
      expect(stats.totalCharacters).toBe(10); // "hello" + "world"
    });

    it("should return nulls for empty buffer", () => {
      const stats = buffer.getStats();
      expect(stats.count).toBe(0);
      expect(stats.oldestTimestamp).toBeNull();
      expect(stats.newestTimestamp).toBeNull();
    });
  });

  describe("clear", () => {
    it("should empty the buffer", () => {
      buffer.push(createTestUtterance());
      buffer.push(createTestUtterance());
      expect(buffer.isEmpty()).toBe(false);

      buffer.clear();
      expect(buffer.isEmpty()).toBe(true);
      expect(buffer.getAll()).toEqual([]);
    });
  });
});
