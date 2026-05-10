import { describe, expect, it } from "bun:test";
import { getCategoryThreshold } from "../../src/pipeline/tier4-alert";
import {
  getSpeakerProcessingPriority,
  SILENT_COLLABORATOR_THRESHOLDS,
  SPEAKER_AWARE_TIER4_CONFIDENCE,
} from "../../src/speculative/types";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestSpeaker,
} from "../helpers";

describe("getSpeakerProcessingPriority", () => {
  it("returns 'high' for current user", () => {
    const speaker = createTestSpeaker({
      type: "TEAM",
      isCurrentUser: true,
    });
    expect(getSpeakerProcessingPriority(speaker)).toBe("high");
  });

  it("returns 'standard' for team member who is not current user", () => {
    const speaker = createTeamSpeaker("user-1", "Alice", {
      isCurrentUser: false,
    });
    expect(getSpeakerProcessingPriority(speaker)).toBe("standard");
  });

  it("returns 'low' for external speaker", () => {
    const speaker = createExternalSpeaker("Client");
    expect(getSpeakerProcessingPriority(speaker)).toBe("low");
  });
});

describe("SPEAKER_AWARE_TIER4_CONFIDENCE", () => {
  it("has lower threshold for high priority (current user)", () => {
    expect(SPEAKER_AWARE_TIER4_CONFIDENCE.high).toBeLessThan(
      SPEAKER_AWARE_TIER4_CONFIDENCE.standard
    );
  });

  it("has higher threshold for low priority (external)", () => {
    expect(SPEAKER_AWARE_TIER4_CONFIDENCE.low).toBeGreaterThan(
      SPEAKER_AWARE_TIER4_CONFIDENCE.standard
    );
  });

  it("all thresholds are between 0 and 1", () => {
    for (const value of Object.values(SPEAKER_AWARE_TIER4_CONFIDENCE)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});

describe("SILENT_COLLABORATOR_THRESHOLDS", () => {
  it("has thresholds for all 12 alert categories", () => {
    const categories = [
      "policy_violation",
      "information_risk",
      "self_contradiction",
      "team_inconsistency",
      "client_backtrack",
      "pressure_detected",
      "risky_commitment",
      "scope_creep",
      "tone_warning",
      "client_disengagement",
      "missing_clarity",
      "undiscussed_agenda",
    ] as const;

    for (const category of categories) {
      expect(SILENT_COLLABORATOR_THRESHOLDS[category]).toBeDefined();
      expect(typeof SILENT_COLLABORATOR_THRESHOLDS[category]).toBe("number");
    }
  });

  it("policy_violation and information_risk have lowest thresholds (highest sensitivity)", () => {
    expect(SILENT_COLLABORATOR_THRESHOLDS.policy_violation).toBeLessThanOrEqual(
      SILENT_COLLABORATOR_THRESHOLDS.tone_warning
    );
    expect(SILENT_COLLABORATOR_THRESHOLDS.information_risk).toBeLessThanOrEqual(
      SILENT_COLLABORATOR_THRESHOLDS.tone_warning
    );
  });

  it("all thresholds are between 0 and 1", () => {
    for (const value of Object.values(SILENT_COLLABORATOR_THRESHOLDS)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("highest-risk categories have thresholds <= 0.7", () => {
    expect(SILENT_COLLABORATOR_THRESHOLDS.policy_violation).toBeLessThanOrEqual(
      0.7
    );
    expect(SILENT_COLLABORATOR_THRESHOLDS.information_risk).toBeLessThanOrEqual(
      0.7
    );
    expect(
      SILENT_COLLABORATOR_THRESHOLDS.self_contradiction
    ).toBeLessThanOrEqual(0.7);
  });
});

describe("getCategoryThreshold", () => {
  it("returns the correct threshold for policy_violation", () => {
    expect(getCategoryThreshold("policy_violation")).toBe(
      SILENT_COLLABORATOR_THRESHOLDS.policy_violation
    );
  });

  it("returns the correct threshold for tone_warning", () => {
    expect(getCategoryThreshold("tone_warning")).toBe(
      SILENT_COLLABORATOR_THRESHOLDS.tone_warning
    );
  });

  it("returns higher threshold for tone_warning than policy_violation", () => {
    const toneThreshold = getCategoryThreshold("tone_warning");
    const policyThreshold = getCategoryThreshold("policy_violation");
    expect(toneThreshold).toBeGreaterThan(policyThreshold);
  });
});
