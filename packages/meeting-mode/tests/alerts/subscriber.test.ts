import { describe, expect, it } from "bun:test";
import type { Alert } from "../../src/alerts/types";
import {
  extractSessionId,
  extractUserIdFromAlertChannel,
  personalAlertChannel,
  sharedAlertChannel,
} from "../../src/channels";

describe("AlertSubscriber channel resolution", () => {
  const sessionId = "test-session";
  const userId = "user-alice";

  describe("channel key generation", () => {
    it("should generate correct shared alert channel", () => {
      expect(sharedAlertChannel(sessionId)).toBe(
        `meeting.alert.${sessionId}.shared`
      );
    });

    it("should generate correct personal alert channel", () => {
      expect(personalAlertChannel(sessionId, userId)).toBe(
        `meeting.alert.${sessionId}.user.${userId}`
      );
    });
  });

  describe("extractSessionId", () => {
    it("should extract sessionId from shared alert channel", () => {
      const channel = `meeting.alert.${sessionId}.shared`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from personal alert channel", () => {
      const channel = `meeting.alert.${sessionId}.user.${userId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from utterance channel", () => {
      const channel = `meeting.utterance.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from topic channel", () => {
      const channel = `meeting.topic.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from commitment channel", () => {
      const channel = `meeting.commitment.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from speaker channel", () => {
      const channel = `meeting.speaker.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from audio channel", () => {
      const channel = `realtime.audio.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });

    it("should extract sessionId from stt channel", () => {
      const channel = `realtime.stt.${sessionId}`;
      expect(extractSessionId(channel)).toBe(sessionId);
    });
  });

  describe("extractUserIdFromAlertChannel", () => {
    it("should extract userId from personal alert channel", () => {
      const channel = `meeting.alert.${sessionId}.user.${userId}`;
      expect(extractUserIdFromAlertChannel(channel)).toBe(userId);
    });

    it("should return undefined for shared alert channel", () => {
      const channel = `meeting.alert.${sessionId}.shared`;
      expect(extractUserIdFromAlertChannel(channel)).toBeUndefined();
    });

    it("should return undefined for non-alert channel", () => {
      const channel = `meeting.utterance.${sessionId}`;
      expect(extractUserIdFromAlertChannel(channel)).toBeUndefined();
    });
  });

  describe("message parsing", () => {
    it("should parse a valid alert JSON message", () => {
      const alert: Alert = {
        id: "alert-1",
        category: "scope_creep",
        severity: "medium",
        triggerUtteranceId: "utt-1",
        speaker: {
          speakerId: "spk_0",
          type: "EXTERNAL",
          name: "Client",
          isCurrentUser: false,
          confidence: 0.8,
        },
        topicId: "pricing",
        timestamp: Date.now(),
        title: "Scope creep",
        message: "Client expanding scope",
        routing: "shared",
        status: "pending",
        confidence: 0.85,
        triggerTier: 2,
      };

      const message = JSON.stringify(alert);
      const parsed = JSON.parse(message) as Alert;

      expect(parsed.id).toBe("alert-1");
      expect(parsed.category).toBe("scope_creep");
      expect(parsed.routing).toBe("shared");
      expect(parsed.speaker.type).toBe("EXTERNAL");
    });

    it("should handle malformed JSON gracefully", () => {
      expect(() => JSON.parse("not-json")).toThrow();
    });
  });

  describe("channel matching for subscriber", () => {
    it("should correctly match shared channel for a given session", () => {
      const channel = sharedAlertChannel(sessionId);
      expect(channel.startsWith("meeting.alert.")).toBe(true);
      expect(channel.endsWith(".shared")).toBe(true);
    });

    it("should correctly match personal channel for a given session and user", () => {
      const channel = personalAlertChannel(sessionId, userId);
      expect(channel.startsWith("meeting.alert.")).toBe(true);
      expect(channel).toContain(`.user.${userId}`);
    });

    it("should differentiate between shared and personal channels", () => {
      const shared = sharedAlertChannel(sessionId);
      const personal = personalAlertChannel(sessionId, userId);
      expect(shared).not.toBe(personal);
      expect(shared.endsWith(".shared")).toBe(true);
      expect(personal.endsWith(userId)).toBe(true);
    });
  });
});
