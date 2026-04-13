import { describe, expect, it } from "bun:test";
import {
  resolveAlertRouting,
  resolveFullRouting,
  resolveTargetUserId,
} from "../../src/alerts/router";
import type { AlertCategory } from "../../src/alerts/types";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

describe("AlertRouter", () => {
  const viewerUserId = "user-alice";
  const teamSpeaker = createTeamSpeaker(viewerUserId, "Alice", {
    speakerId: "spk_0",
  });
  const otherTeamSpeaker = createTeamSpeaker("user-bob", "Bob", {
    speakerId: "spk_2",
  });
  const externalSpeaker = createExternalSpeaker("Client", {
    speakerId: "spk_1",
  });

  describe("resolveAlertRouting", () => {
    describe("personal-when-own, shared-when-team-member categories", () => {
      const personalCategories: AlertCategory[] = [
        "self_contradiction",
        "risky_commitment",
        "tone_warning",
      ];

      for (const category of personalCategories) {
        it(`should route ${category} as personal when speaker is the viewer`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: teamSpeaker,
            viewerUserId,
          });
          expect(result).toBe("personal");
        });

        it(`should route ${category} as shared when speaker is another team member`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: otherTeamSpeaker,
            viewerUserId,
          });
          expect(result).toBe("shared");
        });

        it(`should route ${category} as shared when speaker is external`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: externalSpeaker,
            viewerUserId,
          });
          expect(result).toBe("shared");
        });
      }
    });

    describe("always-shared categories", () => {
      const sharedCategories: AlertCategory[] = [
        "team_inconsistency",
        "scope_creep",
        "client_backtrack",
        "missing_clarity",
        "pressure_detected",
        "client_disengagement",
        "undiscussed_agenda",
      ];

      for (const category of sharedCategories) {
        it(`should route ${category} as shared regardless of speaker`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: teamSpeaker,
            viewerUserId,
          });
          expect(result).toBe("shared");
        });
      }
    });

    describe("always-both categories", () => {
      const bothCategories: AlertCategory[] = [
        "information_risk",
        "policy_violation",
      ];

      for (const category of bothCategories) {
        it(`should route ${category} as both regardless of speaker`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: teamSpeaker,
            viewerUserId,
          });
          expect(result).toBe("both");
        });

        it(`should route ${category} as both for external speaker`, () => {
          const result = resolveAlertRouting({
            category,
            speaker: externalSpeaker,
            viewerUserId,
          });
          expect(result).toBe("both");
        });
      }
    });

    describe("edge cases", () => {
      it("should handle team member without userId matching viewer", () => {
        const speaker = createTeamSpeaker("user-charlie", "Charlie");
        const result = resolveAlertRouting({
          category: "self_contradiction",
          speaker,
          viewerUserId,
        });
        expect(result).toBe("shared");
      });

      it("should handle speaker with no userId (external default)", () => {
        const speaker = createExternalSpeaker("Unknown");
        const result = resolveAlertRouting({
          category: "self_contradiction",
          speaker,
          viewerUserId,
        });
        expect(result).toBe("shared");
      });
    });
  });

  describe("resolveTargetUserId", () => {
    it("should return speaker userId for personal routing", () => {
      const result = resolveTargetUserId({
        category: "self_contradiction",
        speaker: teamSpeaker,
        viewerUserId,
      });
      expect(result).toBe(viewerUserId);
    });

    it("should return undefined for shared routing", () => {
      const result = resolveTargetUserId({
        category: "scope_creep",
        speaker: externalSpeaker,
        viewerUserId,
      });
      expect(result).toBeUndefined();
    });

    it("should return speaker userId for both routing", () => {
      const result = resolveTargetUserId({
        category: "information_risk",
        speaker: teamSpeaker,
        viewerUserId,
      });
      expect(result).toBe(viewerUserId);
    });
  });

  describe("resolveFullRouting", () => {
    it("should return both routing and targetUserId for both category", () => {
      const result = resolveFullRouting({
        category: "policy_violation",
        speaker: teamSpeaker,
        viewerUserId,
      });
      expect(result.routing).toBe("both");
      expect(result.targetUserId).toBe(viewerUserId);
    });

    it("should return shared routing with no targetUserId for shared category", () => {
      const result = resolveFullRouting({
        category: "scope_creep",
        speaker: externalSpeaker,
        viewerUserId,
      });
      expect(result.routing).toBe("shared");
      expect(result.targetUserId).toBeUndefined();
    });

    it("should return personal routing with targetUserId for own category", () => {
      const result = resolveFullRouting({
        category: "tone_warning",
        speaker: teamSpeaker,
        viewerUserId,
      });
      expect(result.routing).toBe("personal");
      expect(result.targetUserId).toBe(viewerUserId);
    });
  });
});
