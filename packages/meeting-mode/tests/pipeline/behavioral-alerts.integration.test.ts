import { describe, expect, it } from "bun:test";
import { buildAlertFromTier4Response } from "../../src/pipeline/tier4-alert";
import type { Tier4Context } from "../../src/pipeline/types";

function createMockContext(
  overrides: Partial<Tier4Context> = {}
): Tier4Context {
  return {
    triggerUtteranceId: "utt-123",
    utterance:
      "We absolutely must deliver this entire new feature set by tomorrow morning or we're screwed.",
    speaker: {
      speakerId: "spk_boss",
      type: "TEAM",
      name: "Boss",
      userId: "user-boss",
      diarizationIndices: [0],
      isCurrentUser: false,
      confidence: 0.99,
    },
    topicId: "topic-1",
    topicSummary: "Deadline discussion",
    tier1Result: {
      detections: [
        {
          type: "keyword",
          pattern: "must deliver",
          startIndex: 0,
          endIndex: 12,
        },
      ],
      blocklistHit: false,
      technicalHit: false,
      pricingHit: false,
    },
    tier2Classification: {
      intent: "directive",
      commitmentType: "timeline",
      tone: "urgent",
      riskSignals: ["tight_deadline", "high_pressure"],
      extractedData: {},
      confidence: 0.95,
    },
    recentUtterances: [],
    matchedHistoricalItems: [],
    matchedCommitments: [],
    relevantConstraints: [],
    ...overrides,
  };
}

describe("Behavioral & Risk Alerts Pipeline", () => {
  it("processes a high-pressure risk signal into an alert", () => {
    const context = createMockContext();

    // We mock the actual LLM call for the unit test context, or provide a fixed response
    const mockTier4Response = {
      alertType: "pressure_detected" as const,
      severity: "high" as const,
      message:
        "Speaker is imposing a highly constrained deadline causing pressure.",
      surfaceReason:
        "Speaker is imposing a highly constrained deadline causing pressure.",
      suggestion: "Acknowledge deadline and discuss feasibility.",
      confidence: 0.9,
      shouldSurface: true,
      routing: "shared" as const,
      reasoning: "The tone is urgent and risks are tight_deadline.",
    };

    const alert = buildAlertFromTier4Response({
      response: mockTier4Response,
      triggerUtteranceId: context.triggerUtteranceId,
      speaker: context.speaker,
      topicId: context.topicId,
    });
    expect(alert).toBeDefined();
    expect(alert?.category).toBe("pressure_detected");
    expect(alert?.severity).toBe("high");
    expect(alert?.title).toBe("Pressure tactic");
    expect(alert?.message).toBe(
      "Speaker is imposing a highly constrained deadline causing pressure."
    );
  });

  it("handles scope creep risk signals", () => {
    const context = createMockContext({
      utterance:
        "While we're at it, let's just rewrite the entire backend in Rust.",
      tier2Classification: {
        intent: "proposal",
        commitmentType: "architecture",
        tone: "casual",
        riskSignals: ["scope_creep", "unplanned_work"],
        extractedData: {},
        confidence: 0.88,
      },
    });

    const mockTier4Response = {
      alertType: "scope_creep" as const,
      severity: "medium" as const,
      message:
        "Significant unplanned architectural change proposed mid-sprint.",
      surfaceReason:
        "Significant unplanned architectural change proposed mid-sprint.",
      suggestion: "Log as technical debt or create a spike ticket.",
      confidence: 0.85,
      shouldSurface: true,
      routing: "shared" as const,
      reasoning: "Speaker casually proposes a massive rewrite.",
    };

    const alert = buildAlertFromTier4Response({
      response: mockTier4Response,
      triggerUtteranceId: context.triggerUtteranceId,
      speaker: context.speaker,
      topicId: context.topicId,
    });
    expect(alert).toBeDefined();
    expect(alert?.category).toBe("scope_creep");
    expect(alert?.severity).toBe("medium");
    expect(alert?.title).toBe("Scope creep");
  });
  it("handles client backtrack risk signals", () => {
    const context = createMockContext({
      utterance: "Actually, we need this done by Tuesday instead of Friday.",
      tier2Classification: {
        intent: "directive",
        commitmentType: "timeline",
        tone: "demanding",
        riskSignals: ["backtracking", "schedule_change"],
        extractedData: {},
        confidence: 0.9,
      },
    });

    const mockTier4Response = {
      alertType: "client_backtrack" as const,
      severity: "high" as const,
      message: "Client is changing the previously agreed upon timeline.",
      surfaceReason: "Client is changing the previously agreed upon timeline.",
      suggestion:
        "Confirm if the new timeline is feasible and point out the prior agreement.",
      confidence: 0.9,
      shouldSurface: true,
      routing: "shared" as const,
      reasoning:
        "Speaker is changing the timeline to Tuesday instead of Friday.",
    };

    const alert = buildAlertFromTier4Response({
      response: mockTier4Response,
      triggerUtteranceId: context.triggerUtteranceId,
      speaker: context.speaker,
      topicId: context.topicId,
    });
    expect(alert).toBeDefined();
    expect(alert?.category).toBe("client_backtrack");
    expect(alert?.severity).toBe("high");
    expect(alert?.title).toBe("Client backtrack");
  });

  it("handles information risk signals", () => {
    const context = createMockContext({
      utterance: "Our production database password is Password123!",
      tier2Classification: {
        intent: "statement",
        commitmentType: null,
        tone: "casual",
        riskSignals: ["sensitive_data_exposure", "password_mentioned"],
        extractedData: {},
        confidence: 0.95,
      },
    });

    const mockTier4Response = {
      alertType: "information_risk" as const,
      severity: "critical" as const,
      message:
        "Sensitive information (password) was exposed during the meeting.",
      surfaceReason:
        "Sensitive information (password) was exposed during the meeting.",
      suggestion: "Rotate the exposed password immediately after the call.",
      confidence: 0.95,
      shouldSurface: true,
      routing: "both" as const,
      reasoning: "Speaker explicitly mentioned a production database password.",
    };

    const alert = buildAlertFromTier4Response({
      response: mockTier4Response,
      triggerUtteranceId: context.triggerUtteranceId,
      speaker: context.speaker,
      topicId: context.topicId,
    });
    expect(alert).toBeDefined();
    expect(alert?.category).toBe("information_risk");
    expect(alert?.severity).toBe("critical");
    expect(alert?.title).toBe("Information risk");
  });

  it("handles policy violation risk signals", () => {
    const context = createMockContext({
      utterance:
        "We can probably use the new internal unreleased Alpha API for this client.",
      tier1Result: {
        detections: [],
        blocklistHit: true,
        technicalHit: false,
        pricingHit: false,
      },
      tier2Classification: {
        intent: "proposal",
        commitmentType: "architecture",
        tone: "optimistic",
        riskSignals: ["internal_api_leak", "unreleased_feature"],
        extractedData: {},
        confidence: 0.9,
      },
    });

    const mockTier4Response = {
      alertType: "policy_violation" as const,
      severity: "high" as const,
      message: "Proposed using an unreleased internal API with a client.",
      surfaceReason: "Proposed using an unreleased internal API with a client.",
      suggestion: "Steer the conversation back to public APIs.",
      confidence: 0.9,
      shouldSurface: true,
      routing: "personal" as const,
      reasoning:
        "Speaker is offering an unreleased alpha API to an external client.",
    };

    const alert = buildAlertFromTier4Response({
      response: mockTier4Response,
      triggerUtteranceId: context.triggerUtteranceId,
      speaker: context.speaker,
      topicId: context.topicId,
    });
    expect(alert).toBeDefined();
    expect(alert?.category).toBe("policy_violation");
    expect(alert?.severity).toBe("high");
    expect(alert?.title).toBe("Policy risk");
  });
});
