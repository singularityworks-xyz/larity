import { describe, expect, it } from "bun:test";
import {
  ALERT_PRIORITY,
  ALERT_UX_RULES,
  type AlertCategory,
  type AlertRouting,
  type AlertSeverity,
  type AlertStatus,
  createAlert,
  getAlertExpiryMs,
} from "../../src/alerts/types";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

const ALERT_ID_PATTERN = /^alert_\d+_[a-z0-9]+$/;

describe("Alert Types", () => {
  describe("AlertCategory", () => {
    it("should define all 12 alert categories", () => {
      const categories: AlertCategory[] = [
        "self_contradiction",
        "team_inconsistency",
        "risky_commitment",
        "scope_creep",
        "client_backtrack",
        "missing_clarity",
        "information_risk",
        "tone_warning",
        "pressure_detected",
        "policy_violation",
        "client_disengagement",
        "undiscussed_agenda",
      ];

      expect(categories).toHaveLength(12);

      for (const cat of categories) {
        expect(ALERT_PRIORITY[cat]).toBeDefined();
      }
    });
  });

  describe("ALERT_PRIORITY", () => {
    it("should assign priority 1 to policy_violation (highest)", () => {
      expect(ALERT_PRIORITY.policy_violation).toBe(1);
    });

    it("should assign priority 12 to undiscussed_agenda (lowest)", () => {
      expect(ALERT_PRIORITY.undiscussed_agenda).toBe(12);
    });

    it("should have unique priority values for all categories", () => {
      const priorities = Object.values(ALERT_PRIORITY);
      const unique = new Set(priorities);
      expect(unique.size).toBe(priorities.length);
    });

    it("should order information_risk as second highest", () => {
      expect(ALERT_PRIORITY.information_risk).toBe(2);
    });

    it("should order self_contradiction before team_inconsistency", () => {
      expect(ALERT_PRIORITY.self_contradiction).toBeLessThan(
        ALERT_PRIORITY.team_inconsistency
      );
    });
  });

  describe("ALERT_UX_RULES", () => {
    it("should allow max 2 visible alerts", () => {
      expect(ALERT_UX_RULES.maxVisibleAlerts).toBe(2);
    });

    it("should define display durations for all severities", () => {
      expect(ALERT_UX_RULES.displayDuration.low).toBe(10_000);
      expect(ALERT_UX_RULES.displayDuration.medium).toBe(15_000);
      expect(ALERT_UX_RULES.displayDuration.high).toBe(20_000);
      expect(ALERT_UX_RULES.displayDuration.critical).toBe(30_000);
    });

    it("should define debounce window of 5 seconds", () => {
      expect(ALERT_UX_RULES.debounceWindow).toBe(5000);
    });

    it("should define recently shown window of 60 seconds", () => {
      expect(ALERT_UX_RULES.recentlyShownWindow).toBe(60_000);
    });

    it("should have sound disabled by default", () => {
      expect(ALERT_UX_RULES.soundEnabled).toBe(false);
    });

    it("should have haptic feedback only for critical", () => {
      expect(ALERT_UX_RULES.hapticFeedback.critical).toBe(true);
      expect(ALERT_UX_RULES.hapticFeedback.high).toBe(false);
      expect(ALERT_UX_RULES.hapticFeedback.medium).toBe(false);
      expect(ALERT_UX_RULES.hapticFeedback.low).toBe(false);
    });
  });

  describe("createAlert", () => {
    it("should create an alert with required fields", () => {
      const speaker = createTeamSpeaker("user-1", "Alice");
      const alert = createAlert({
        category: "self_contradiction",
        severity: "medium",
        speaker,
        triggerUtteranceId: "utt-1",
        title: "Self contradiction detected",
        message: "You contradicted your earlier statement",
        routing: "personal",
      });

      expect(alert.id).toMatch(ALERT_ID_PATTERN);
      expect(alert.category).toBe("self_contradiction");
      expect(alert.severity).toBe("medium");
      expect(alert.speaker).toBe(speaker);
      expect(alert.triggerUtteranceId).toBe("utt-1");
      expect(alert.title).toBe("Self contradiction detected");
      expect(alert.message).toBe("You contradicted your earlier statement");
      expect(alert.routing).toBe("personal");
      expect(alert.status).toBe("pending");
      expect(alert.confidence).toBe(0);
      expect(alert.triggerTier).toBe(2);
      expect(alert.topicId).toBe("");
      expect(alert.timestamp).toBeGreaterThan(0);
    });

    it("should allow overriding default fields", () => {
      const speaker = createExternalSpeaker("Client");
      const alert = createAlert({
        category: "scope_creep",
        severity: "high",
        speaker,
        triggerUtteranceId: "utt-2",
        title: "Scope creep detected",
        message: "Client is expanding scope",
        routing: "shared",
        confidence: 0.85,
        triggerTier: 4,
        topicId: "pricing",
        suggestion: "Clarify scope boundaries",
      });

      expect(alert.confidence).toBe(0.85);
      expect(alert.triggerTier).toBe(4);
      expect(alert.topicId).toBe("pricing");
      expect(alert.suggestion).toBe("Clarify scope boundaries");
    });
  });

  describe("getAlertExpiryMs", () => {
    it("should return correct expiry for each severity", () => {
      expect(getAlertExpiryMs("low")).toBe(10_000);
      expect(getAlertExpiryMs("medium")).toBe(15_000);
      expect(getAlertExpiryMs("high")).toBe(20_000);
      expect(getAlertExpiryMs("critical")).toBe(30_000);
    });
  });

  describe("Type correctness", () => {
    it("should accept all valid AlertRouting values", () => {
      const routings: AlertRouting[] = ["shared", "personal", "both"];
      expect(routings).toHaveLength(3);
    });

    it("should accept all valid AlertSeverity values", () => {
      const severities: AlertSeverity[] = ["low", "medium", "high", "critical"];
      expect(severities).toHaveLength(4);
    });

    it("should accept all valid AlertStatus values", () => {
      const statuses: AlertStatus[] = [
        "pending",
        "shown",
        "dismissed",
        "expired",
      ];
      expect(statuses).toHaveLength(4);
    });
  });
});
