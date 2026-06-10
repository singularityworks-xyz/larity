import { describe, expect, it } from "bun:test";
import { checkMissingClarity } from "../../src/speaker-state/clarity-checker";
import type { ClarityCheckInput } from "../../src/speaker-state/types";

describe("checkMissingClarity", () => {
  it("returns null when not a topic shift", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: {
        hasOwner: false,
        hasDeadline: false,
        hasActionItems: false,
        hasExplicitConfirmation: false,
      },
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-1",
      isTopicShift: false,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("returns null when no previous topic id", () => {
    const input: ClarityCheckInput = {
      prevTopicId: undefined,
      prevTopicCompleteness: undefined,
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("returns null when previous topic has fewer than 3 utterances", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: {
        hasOwner: false,
        hasDeadline: false,
        hasActionItems: false,
        hasExplicitConfirmation: false,
      },
      prevTopicUtteranceCount: 2,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("returns null when completeness info is missing", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: undefined,
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("returns null when topic has all required fields", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: {
        hasOwner: true,
        hasDeadline: true,
        hasActionItems: true,
        hasExplicitConfirmation: true,
      },
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("returns null when only one field is missing", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: {
        hasOwner: false,
        hasDeadline: true,
        hasActionItems: true,
        hasExplicitConfirmation: true,
      },
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    expect(checkMissingClarity(input)).toBeNull();
  });

  it("fires missing_clarity alert when 2+ required fields are missing", () => {
    const input: ClarityCheckInput = {
      prevTopicId: "topic-1",
      prevTopicCompleteness: {
        hasOwner: false,
        hasDeadline: false,
        hasActionItems: true,
        hasExplicitConfirmation: false,
      },
      prevTopicUtteranceCount: 5,
      currentTopicId: "topic-2",
      isTopicShift: true,
    };
    const alert = checkMissingClarity(input);
    expect(alert).not.toBeNull();
    expect(alert?.category).toBe("missing_clarity");
    expect(alert?.topicId).toBe("topic-1");
    expect(alert?.severity).toBe("medium");
  });
});
