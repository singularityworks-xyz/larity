import { describe, expect, test } from "bun:test";
import type { Utterance } from "../utterance/types";
import { tierContextForPromptPayload } from "./tier4-context";
import type { Tier4Context } from "./types";

function makeUtterance(index: number, text: string): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1,
    mergedCount: 1,
    sessionId: "test-session",
    speaker: {
      confidence: 0.9,
      diarizationIndices: [index],
      isCurrentUser: false,
      name: index % 2 === 0 ? "Ada" : "Client",
      speakerId: `spk_${index}`,
      type: index % 2 === 0 ? "TEAM" : "EXTERNAL",
    },
    startOffset: index,
    text,
    timestamp: index * 1000,
    utteranceId: `test-session:${index}`,
    wordCount: 5,
  };
}

function makeContext(recentUtterances: Utterance[]): Tier4Context {
  return {
    matchedCommitments: [],
    matchedHistoricalItems: [],
    recentUtterances,
    relevantConstraints: [],
    sessionId: "test-session",
    speaker: makeUtterance(0, "current line").speaker,
    tier1Result: {
      blocklistHit: false,
      detections: [],
      pricingHit: false,
      technicalHit: false,
    },
    tier2Classification: {
      commitmentType: null,
      confidence: 0.9,
      extractedData: {},
      intent: "concern",
      riskSignals: [],
      tone: "neutral",
    },
    topicId: "topic_1",
    topicSummary: "Delivery",
    triggerUtteranceId: "test-session:0",
    utterance: "current line",
  };
}

describe("Tier 4 prompt history slimming (P2.11)", () => {
  test("history renders as compact speaker lines, newest preserved", () => {
    const utterances = [
      makeUtterance(0, "first line here"),
      makeUtterance(1, "second line here"),
      makeUtterance(2, "third line here"),
    ];
    const payload = tierContextForPromptPayload(makeContext(utterances));
    expect(payload.recentUtterances).toEqual([
      "Ada (TEAM): first line here",
      "Client (EXTERNAL): second line here",
      "Ada (TEAM): third line here",
    ]);
  });

  test("history is capped by item count and character budget", () => {
    const longText = "word ".repeat(200);
    const utterances = Array.from({ length: 60 }, (_, i) =>
      makeUtterance(i, `${longText}${i}`)
    );
    const payload = tierContextForPromptPayload(makeContext(utterances));
    const lines = payload.recentUtterances as string[];
    expect(lines.length).toBeLessThanOrEqual(48);
    const totalChars = lines.join("").length;
    // ~1200-token budget plus slack for one long newest line.
    expect(totalChars).toBeLessThan(4800 + 1200);
    // Most-recent-first fill: the newest line always survives.
    expect(lines.at(-1)).toContain("59");
    // No full utterance objects leak through.
    for (const line of lines) {
      expect(typeof line).toBe("string");
    }
  });
});
