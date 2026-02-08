import { beforeEach, describe, expect, it } from "vitest";
import { ContextAssembler } from "../../src/context/context-assembler";
import { RingBuffer } from "../../src/utterance/ring-buffer";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestUtterance,
  resetUtteranceSeq,
} from "../helpers";

const TIMESTAMP_PATTERN = /\[\d{2}:\d{2}:\d{2}\]/;
const PREFIX_PATTERN = /^START: /;
const SUFFIX_PATTERN = / :END$/;

describe("ContextAssembler", () => {
  let buffer: RingBuffer;
  let assembler: ContextAssembler;

  beforeEach(() => {
    buffer = new RingBuffer({ maxSize: 50, maxAgeMs: 120_000 });
    assembler = new ContextAssembler(buffer);
    resetUtteranceSeq();
  });

  describe("assemble", () => {
    it("should format utterances with speaker names", () => {
      const speaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      buffer.push(createTestUtterance({ speaker, text: "Hello everyone." }));

      const result = assembler.assemble({ maxCharacters: 2000 });
      expect(result.text).toContain("Alice");
      expect(result.text).toContain("Hello everyone.");
      expect(result.utteranceCount).toBe(1);
    });

    it("should filter by speakerType", () => {
      const team = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const ext = createExternalSpeaker("Client", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: team, text: "Team says." }));
      buffer.push(
        createTestUtterance({ speaker: ext, text: "External says." })
      );

      const result = assembler.assemble({
        maxCharacters: 2000,
        speakerType: "TEAM",
      });
      expect(result.utteranceCount).toBe(1);
      expect(result.text).toContain("Team says.");
      expect(result.text).not.toContain("External says.");
    });

    it("should filter by speakerId", () => {
      const s1 = createExternalSpeaker("Alice", { speakerId: "spk_0" });
      const s2 = createExternalSpeaker("Bob", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: s1, text: "From Alice." }));
      buffer.push(createTestUtterance({ speaker: s2, text: "From Bob." }));

      const result = assembler.assemble({
        maxCharacters: 2000,
        speakerId: "spk_1",
      });
      expect(result.utteranceCount).toBe(1);
      expect(result.text).toContain("From Bob.");
    });

    it("should filter by userId", () => {
      const team = createTeamSpeaker("user-alice", "Alice", {
        speakerId: "spk_0",
      });
      const ext = createExternalSpeaker("Client", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: team, text: "Alice here." }));
      buffer.push(createTestUtterance({ speaker: ext, text: "Client here." }));

      const result = assembler.assemble({
        maxCharacters: 2000,
        userId: "user-alice",
      });
      expect(result.utteranceCount).toBe(1);
      expect(result.text).toContain("Alice here.");
    });

    it("should filter by topicId", () => {
      buffer.push(
        createTestUtterance({ topicId: "topic-1", text: "On topic." })
      );
      buffer.push(createTestUtterance({ text: "Off topic." }));

      const result = assembler.assemble({
        maxCharacters: 2000,
        topicId: "topic-1",
      });
      expect(result.utteranceCount).toBe(1);
      expect(result.text).toContain("On topic.");
    });

    it("should respect maxCharacters limit and set truncated flag", () => {
      for (let i = 0; i < 20; i++) {
        buffer.push(
          createTestUtterance({
            text: `Message number ${i} with some extra text.`,
            timestamp: Date.now() + i,
          })
        );
      }

      const result = assembler.assemble({ maxCharacters: 200 });
      expect(result.characterCount).toBeLessThanOrEqual(200);
      expect(result.truncated).toBe(true);
    });

    it("should include timestamps when requested", () => {
      buffer.push(
        createTestUtterance({
          text: "Hello.",
          timestamp: Date.now(),
        })
      );

      const withTs = assembler.assemble({
        maxCharacters: 2000,
        includeTimestamps: true,
      });
      expect(withTs.text).toMatch(TIMESTAMP_PATTERN);

      const withoutTs = assembler.assemble({
        maxCharacters: 2000,
        includeTimestamps: false,
      });
      expect(withoutTs.text).not.toMatch(TIMESTAMP_PATTERN);
    });

    it("should apply prefix and suffix", () => {
      buffer.push(createTestUtterance({ text: "Content." }));

      const result = assembler.assemble({
        maxCharacters: 2000,
        prefix: "START: ",
        suffix: " :END",
      });
      expect(result.text).toMatch(PREFIX_PATTERN);
      expect(result.text).toMatch(SUFFIX_PATTERN);
    });

    it("should track topics in result", () => {
      buffer.push(createTestUtterance({ topicId: "topic-a", text: "A." }));
      buffer.push(createTestUtterance({ topicId: "topic-b", text: "B." }));
      buffer.push(createTestUtterance({ topicId: "topic-a", text: "A2." }));

      const result = assembler.assemble({ maxCharacters: 2000 });
      expect(result.topics).toContain("topic-a");
      expect(result.topics).toContain("topic-b");
      expect(result.topics).toHaveLength(2);
    });

    it("should calculate timeSpan correctly", () => {
      const now = Date.now();
      buffer.push(createTestUtterance({ timestamp: now - 10_000 }));
      buffer.push(createTestUtterance({ timestamp: now }));

      const result = assembler.assemble({ maxCharacters: 2000 });
      expect(result.timeSpan).toBe(10_000);
    });
  });

  describe("assembleForRiskEvaluation", () => {
    it("should include constraints in context", () => {
      buffer.push(createTestUtterance({ text: "Discussion point." }));

      const result = assembler.assembleForRiskEvaluation([
        "No discounts over 20%",
        "NDA required",
      ]);
      expect(result.text).toContain("Recent conversation:");
      expect(result.text).toContain("No discounts over 20%");
      expect(result.text).toContain("NDA required");
    });

    it("should work without constraints", () => {
      buffer.push(createTestUtterance({ text: "Some text." }));

      const result = assembler.assembleForRiskEvaluation();
      expect(result.text).toContain("Recent conversation:");
      expect(result.text).toContain("Some text.");
    });
  });

  describe("assembleForTopic", () => {
    it("should only include utterances for the given topic", () => {
      buffer.push(
        createTestUtterance({ topicId: "pricing", text: "Pricing talk." })
      );
      buffer.push(
        createTestUtterance({ topicId: "timeline", text: "Timeline talk." })
      );

      const result = assembler.assembleForTopic("pricing");
      expect(result.text).toContain("Pricing talk.");
      expect(result.text).not.toContain("Timeline talk.");
      expect(result.text).toContain("Discussion on this topic:");
    });
  });

  describe("getSummary", () => {
    it("should return correct counts for team and external", () => {
      const team = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const ext = createExternalSpeaker("Client", { speakerId: "spk_1" });

      buffer.push(createTestUtterance({ speaker: team }));
      buffer.push(createTestUtterance({ speaker: team }));
      buffer.push(createTestUtterance({ speaker: ext }));

      const summary = assembler.getSummary();
      expect(summary.recentUtterances).toBe(3);
      expect(summary.teamUtterances).toBe(2);
      expect(summary.externalUtterances).toBe(1);
    });

    it("should count unique speakers", () => {
      const s1 = createTeamSpeaker("user-1", "Alice", { speakerId: "spk_0" });
      const s2 = createExternalSpeaker("Client A", { speakerId: "spk_1" });
      const s3 = createExternalSpeaker("Client B", { speakerId: "spk_2" });

      buffer.push(createTestUtterance({ speaker: s1 }));
      buffer.push(createTestUtterance({ speaker: s2 }));
      buffer.push(createTestUtterance({ speaker: s1 }));
      buffer.push(createTestUtterance({ speaker: s3 }));

      const summary = assembler.getSummary();
      expect(summary.uniqueSpeakers).toBe(3);
    });

    it("should calculate timeSpan", () => {
      const now = Date.now();
      buffer.push(createTestUtterance({ timestamp: now - 30_000 }));
      buffer.push(createTestUtterance({ timestamp: now }));

      const summary = assembler.getSummary();
      expect(summary.timeSpanMs).toBe(30_000);
    });

    it("should calculate average utterance length", () => {
      buffer.push(createTestUtterance({ text: "ab" })); // 2 chars
      buffer.push(createTestUtterance({ text: "abcd" })); // 4 chars

      const summary = assembler.getSummary();
      expect(summary.averageUtteranceLength).toBe(3); // (2+4)/2 = 3
    });

    it("should handle empty buffer", () => {
      const summary = assembler.getSummary();
      expect(summary.recentUtterances).toBe(0);
      expect(summary.teamUtterances).toBe(0);
      expect(summary.externalUtterances).toBe(0);
      expect(summary.uniqueSpeakers).toBe(0);
      expect(summary.timeSpanMs).toBe(0);
      expect(summary.averageUtteranceLength).toBe(0);
    });
  });
});
