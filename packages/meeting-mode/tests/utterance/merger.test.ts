import { beforeEach, describe, expect, it } from "vitest";
import { UtteranceMerger } from "../../src/utterance/merger";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestUtterance,
  resetUtteranceSeq,
} from "../helpers";

describe("UtteranceMerger", () => {
  let merger: UtteranceMerger;

  beforeEach(() => {
    merger = new UtteranceMerger(5000); // 5s gap threshold
    resetUtteranceSeq();
  });

  describe("push", () => {
    it("should buffer the first utterance and return null", () => {
      const u = createTestUtterance();
      const result = merger.push(u);
      expect(result).toBeNull();
      expect(merger.hasPending()).toBe(true);
    });

    it("should merge same-speakerId utterances within gap threshold", () => {
      const speaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const now = Date.now();

      const u1 = createTestUtterance({
        speaker,
        text: "Hello",
        timestamp: now,
        duration: 1.0,
        wordCount: 1,
      });
      const u2 = createTestUtterance({
        speaker,
        text: "world",
        timestamp: now + 1500, // within gap
        duration: 0.8,
        wordCount: 1,
      });

      merger.push(u1);
      const result = merger.push(u2);

      // Still buffered (merged into pending)
      expect(result).toBeNull();

      // Flush to get the merged result
      const merged = merger.flush();
      expect(merged).not.toBeNull();
      expect(merged?.text).toBe("Hello world");
      expect(merged?.wordCount).toBe(2);
      expect(merged?.mergedCount).toBe(2);
    });

    it("should NOT merge different speakerId utterances", () => {
      const speaker1 = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const speaker2 = createExternalSpeaker("Client", {
        speakerId: "spk_1",
      });
      const now = Date.now();

      const u1 = createTestUtterance({
        speaker: speaker1,
        text: "From Alice",
        timestamp: now,
        duration: 1.0,
      });
      const u2 = createTestUtterance({
        speaker: speaker2,
        text: "From Client",
        timestamp: now + 1500,
        duration: 1.0,
      });

      merger.push(u1);
      const emitted = merger.push(u2);

      // u1 should be emitted (different speaker)
      expect(emitted).not.toBeNull();
      expect(emitted?.text).toBe("From Alice");
      expect(emitted?.speaker.speakerId).toBe("spk_0");
    });

    it("should NOT merge same speakerId utterances that exceed gap threshold", () => {
      const speaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
      });
      const now = Date.now();

      const u1 = createTestUtterance({
        speaker,
        text: "First part",
        timestamp: now,
        duration: 1.0,
        wordCount: 2,
      });
      const u2 = createTestUtterance({
        speaker,
        text: "Second part",
        timestamp: now + 10_000, // 10s gap, exceeds 5s threshold
        duration: 1.0,
        wordCount: 2,
      });

      merger.push(u1);
      const emitted = merger.push(u2);

      expect(emitted).not.toBeNull();
      expect(emitted?.text).toBe("First part");
    });

    it("should NOT merge same type but different speakerId", () => {
      const ext1 = createExternalSpeaker("Client A", { speakerId: "spk_0" });
      const ext2 = createExternalSpeaker("Client B", { speakerId: "spk_1" });
      const now = Date.now();

      const u1 = createTestUtterance({
        speaker: ext1,
        text: "From A",
        timestamp: now,
        duration: 1.0,
      });
      const u2 = createTestUtterance({
        speaker: ext2,
        text: "From B",
        timestamp: now + 1000,
        duration: 1.0,
      });

      merger.push(u1);
      const emitted = merger.push(u2);

      expect(emitted).not.toBeNull();
      expect(emitted?.text).toBe("From A");
      expect(emitted?.speaker.speakerId).toBe("spk_0");
    });
  });

  describe("merge details", () => {
    it("should preserve the first speaker identity in merged result", () => {
      const speaker = createTeamSpeaker("user-1", "Alice", {
        speakerId: "spk_0",
        confidence: 0.95,
      });
      const now = Date.now();

      merger.push(
        createTestUtterance({
          speaker,
          text: "Hello",
          timestamp: now,
          duration: 1.0,
          wordCount: 1,
          confidenceScore: 0.9,
        })
      );
      merger.push(
        createTestUtterance({
          speaker,
          text: "there",
          timestamp: now + 1500,
          duration: 0.5,
          wordCount: 1,
          confidenceScore: 1.0,
        })
      );

      const merged = merger.flush();
      expect(merged).not.toBeNull();
      expect(merged?.speaker).toBe(speaker);
      expect(merged?.speaker.name).toBe("Alice");
      expect(merged?.speaker.userId).toBe("user-1");
    });

    it("should compute weighted confidence", () => {
      const speaker = createExternalSpeaker("Client", { speakerId: "spk_0" });
      const now = Date.now();

      merger.push(
        createTestUtterance({
          speaker,
          text: "word1 word2",
          timestamp: now,
          duration: 1.0,
          wordCount: 2,
          confidenceScore: 0.8,
        })
      );
      merger.push(
        createTestUtterance({
          speaker,
          text: "word3",
          timestamp: now + 1500,
          duration: 0.5,
          wordCount: 1,
          confidenceScore: 1.0,
        })
      );

      const merged = merger.flush();
      // Weighted: (0.8*2 + 1.0*1) / 3 = 2.6/3 ≈ 0.87
      expect(merged?.confidenceScore).toBeCloseTo(0.87, 1);
    });
  });

  describe("flush", () => {
    it("should return null when nothing is pending", () => {
      expect(merger.flush()).toBeNull();
    });

    it("should return pending utterance and clear state", () => {
      merger.push(createTestUtterance({ text: "pending" }));
      expect(merger.hasPending()).toBe(true);

      const flushed = merger.flush();
      expect(flushed).not.toBeNull();
      expect(flushed?.text).toBe("pending");
      expect(merger.hasPending()).toBe(false);
    });
  });
});
