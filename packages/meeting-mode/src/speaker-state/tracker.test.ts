import { beforeEach, describe, expect, test } from "bun:test";
import type { Tier2Classification } from "../pipeline/types";
import type { Utterance } from "../utterance/types";
import { SpeakerStateTracker } from "./tracker";

function makeUtterance(sessionId: string, utteranceId: string): Utterance {
  return {
    confidenceScore: 0.9,
    duration: 1,
    mergedCount: 1,
    sessionId,
    speaker: {
      confidence: 0.9,
      diarizationIndices: [0],
      isCurrentUser: false,
      name: "Speaker 1",
      speakerId: "spk_0",
      type: "EXTERNAL",
    },
    startOffset: 0,
    text: "we need to talk about the budget review",
    timestamp: Date.now(),
    utteranceId,
    wordCount: 8,
  };
}

function makeClassification(): Tier2Classification {
  return {
    commitmentType: null,
    confidence: 0.9,
    extractedData: {},
    intent: "general",
    riskSignals: [],
    tone: "neutral",
  };
}

function endOfMeetingAlerts(
  tracker: SpeakerStateTracker,
  sessionId: string
): string[] {
  const utterance = makeUtterance(sessionId, `${sessionId}:0`);
  tracker.ingest(sessionId, utterance, makeClassification());
  return tracker
    .checkAlerts(
      sessionId,
      utterance,
      makeClassification(),
      [],
      ["Budget review"],
      true
    )
    .map((alert) => alert.category);
}

describe("SpeakerStateTracker session-scoped dedupe", () => {
  let tracker: SpeakerStateTracker;
  beforeEach(() => {
    tracker = new SpeakerStateTracker();
  });

  test("same alert fires independently in two sessions", () => {
    expect(endOfMeetingAlerts(tracker, "s1")).toContain("undiscussed_agenda");
    // Pre-fix the global firedAlerts set suppressed this second firing.
    expect(endOfMeetingAlerts(tracker, "s2")).toContain("undiscussed_agenda");
  });

  test("dedupe still holds within a session", () => {
    expect(endOfMeetingAlerts(tracker, "s1")).toContain("undiscussed_agenda");
    expect(endOfMeetingAlerts(tracker, "s1")).not.toContain(
      "undiscussed_agenda"
    );
  });

  test("closeSession clears the session dedupe keys", () => {
    expect(endOfMeetingAlerts(tracker, "s1")).toContain("undiscussed_agenda");
    tracker.closeSession("s1");
    expect(endOfMeetingAlerts(tracker, "s1")).toContain("undiscussed_agenda");
  });
});
