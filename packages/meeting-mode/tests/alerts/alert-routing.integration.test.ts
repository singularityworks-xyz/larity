import { afterEach, beforeEach, describe, expect, it, vi } from "bun:test";
import { redisKeys } from "../../../infra/redis/keys";
import { TTL } from "../../../infra/redis/ttl";
import { AlertQueueManager } from "../../src/alerts/queue";
import {
  resolveAlertRouting,
  resolveFullRouting,
} from "../../src/alerts/router";
import type { Alert, AlertCategory } from "../../src/alerts/types";
import { ALERT_PRIORITY, createAlert } from "../../src/alerts/types";
import {
  extractSessionId,
  extractUserIdFromAlertChannel,
  personalAlertChannel,
  sharedAlertChannel,
} from "../../src/channels";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

const publishedMessages: Array<{ channel: string; message: string }> = [];

function createMockRedis() {
  return {
    publish: (_channel: string, _message: string) => {
      publishedMessages.push({ channel: _channel, message: _message });
      return Promise.resolve(1);
    },
  };
}

class IntegrationAlertPublisher {
  private readonly redis: ReturnType<typeof createMockRedis>;
  private readonly sessionId: string;

  constructor(redis: ReturnType<typeof createMockRedis>, sessionId: string) {
    this.redis = redis;
    this.sessionId = sessionId;
  }

  async publish(alert: Alert): Promise<void> {
    const tasks: Promise<void>[] = [];

    switch (alert.routing) {
      case "shared":
        tasks.push(this.publishToShared(alert));
        break;
      case "personal":
        tasks.push(this.publishToPersonal(alert));
        break;
      case "both":
        tasks.push(this.publishToShared(alert));
        tasks.push(this.publishToPersonal(alert));
        break;
      default:
        break;
    }

    await Promise.all(tasks);
  }

  private async publishToShared(alert: Alert): Promise<void> {
    const channel = sharedAlertChannel(this.sessionId);
    await this.redis.publish(channel, JSON.stringify(alert));
  }

  private async publishToPersonal(alert: Alert): Promise<void> {
    if (!alert.targetUserId) {
      return;
    }
    const channel = personalAlertChannel(this.sessionId, alert.targetUserId);
    await this.redis.publish(channel, JSON.stringify(alert));
  }
}

function makeRoutedAlert(
  category: AlertCategory,
  viewerUserId: string,
  isOwnSpeech: boolean
): Alert {
  const speaker = isOwnSpeech
    ? createTeamSpeaker(viewerUserId, "Alice")
    : createExternalSpeaker("Client");

  const { routing, targetUserId } = resolveFullRouting({
    category,
    speaker,
    viewerUserId,
  });

  return createAlert({
    category,
    severity: "medium",
    speaker,
    triggerUtteranceId: "utt-1",
    title: `${category} alert`,
    message: `Alert for ${category}`,
    routing,
    targetUserId,
  });
}

describe("Alert Routing Integration", () => {
  const sessionId = "int-test-session";
  const viewerUserId = "user-alice";
  let redis: ReturnType<typeof createMockRedis>;
  let publisher: IntegrationAlertPublisher;
  let queue: AlertQueueManager;

  beforeEach(() => {
    vi.useFakeTimers();
    publishedMessages.length = 0;
    redis = createMockRedis();
    publisher = new IntegrationAlertPublisher(redis, sessionId);
    queue = new AlertQueueManager({
      maxVisible: 2,
      debounceWindow: 5000,
      recentlyShownWindow: 60_000,
    });
  });

  afterEach(() => {
    queue.clear();
    vi.useRealTimers();
  });

  describe("Router → Publisher → Queue (shared alerts)", () => {
    it("should route scope_creep to shared channel and display in queue", async () => {
      const alert = makeRoutedAlert("scope_creep", viewerUserId, false);

      expect(alert.routing).toBe("shared");

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(1);
      expect(publishedMessages[0]?.channel).toBe(sharedAlertChannel(sessionId));

      const queueResult = queue.enqueue(alert);
      expect(queueResult.displayed).toBe(true);
    });

    it("should route team_inconsistency to shared channel", async () => {
      const alert = makeRoutedAlert("team_inconsistency", viewerUserId, false);

      expect(alert.routing).toBe("shared");

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(1);
      expect(publishedMessages[0]?.channel).toBe(sharedAlertChannel(sessionId));
    });

    it("should route pressure_detected to shared channel", async () => {
      const alert = makeRoutedAlert("pressure_detected", viewerUserId, false);

      expect(alert.routing).toBe("shared");

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(1);
      expect(publishedMessages[0]?.channel).toBe(sharedAlertChannel(sessionId));
    });
  });

  describe("Router → Publisher → Queue (personal alerts)", () => {
    it("should route own self_contradiction to personal channel", async () => {
      const alert = makeRoutedAlert("self_contradiction", viewerUserId, true);

      expect(alert.routing).toBe("personal");
      expect(alert.targetUserId).toBe(viewerUserId);

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(1);
      expect(publishedMessages[0]?.channel).toBe(
        personalAlertChannel(sessionId, viewerUserId)
      );
    });

    it("should route own tone_warning to personal channel", async () => {
      const alert = makeRoutedAlert("tone_warning", viewerUserId, true);

      expect(alert.routing).toBe("personal");
      expect(alert.targetUserId).toBe(viewerUserId);

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(1);
      expect(publishedMessages[0]?.channel).toBe(
        personalAlertChannel(sessionId, viewerUserId)
      );
    });
  });

  describe("Router → Publisher → Queue (both alerts)", () => {
    it("should route information_risk to both channels", async () => {
      const alert = makeRoutedAlert("information_risk", viewerUserId, true);

      expect(alert.routing).toBe("both");

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(2);
      const channels = publishedMessages.map((m) => m.channel);
      expect(channels).toContain(sharedAlertChannel(sessionId));
      expect(channels).toContain(personalAlertChannel(sessionId, viewerUserId));
    });

    it("should route policy_violation to both channels", async () => {
      const alert = makeRoutedAlert("policy_violation", viewerUserId, true);

      expect(alert.routing).toBe("both");

      await publisher.publish(alert);

      expect(publishedMessages).toHaveLength(2);
    });
  });

  describe("Multi-alert scenario", () => {
    it("should handle multiple alerts with correct routing and queue management", async () => {
      const alert1 = makeRoutedAlert("scope_creep", viewerUserId, false);
      const alert2 = makeRoutedAlert("risky_commitment", viewerUserId, false);
      const alert3 = makeRoutedAlert("missing_clarity", viewerUserId, false);

      await publisher.publish(alert1);
      await publisher.publish(alert2);
      await publisher.publish(alert3);

      queue.enqueue(alert1);
      queue.enqueue(alert2);
      queue.enqueue(alert3);

      expect(queue.getActiveCount()).toBe(2);
      expect(queue.getPendingCount()).toBe(1);
    });

    it("should correctly handle priority eviction in queue", () => {
      const scopeCreep = makeRoutedAlert("scope_creep", viewerUserId, false);
      const missingClarity = makeRoutedAlert(
        "missing_clarity",
        viewerUserId,
        false
      );
      const policyViolation = makeRoutedAlert(
        "policy_violation",
        viewerUserId,
        true
      );

      queue.enqueue(scopeCreep);
      queue.enqueue(missingClarity);

      expect(queue.getActiveCount()).toBe(2);

      const evictionResult = queue.enqueue(policyViolation);

      expect(evictionResult.displayed).toBe(true);
      expect(evictionResult.evicted).toBeDefined();
      if (evictionResult.evicted) {
        expect(ALERT_PRIORITY[policyViolation.category]).toBeLessThan(
          ALERT_PRIORITY[evictionResult.evicted.category]
        );
      }
    });
  });

  describe("Channel extraction roundtrip", () => {
    it("should extract sessionId from all published channels", async () => {
      const alert = makeRoutedAlert("information_risk", viewerUserId, true);
      await publisher.publish(alert);

      for (const { channel } of publishedMessages) {
        const extracted = extractSessionId(channel);
        expect(extracted).toBe(sessionId);
      }
    });

    it("should extract userId from personal channel", async () => {
      const alert = makeRoutedAlert("self_contradiction", viewerUserId, true);
      await publisher.publish(alert);

      const personalMsg = publishedMessages.find((m) =>
        m.channel.includes(".user.")
      );
      expect(personalMsg).toBeDefined();

      if (personalMsg) {
        const extractedUserId = extractUserIdFromAlertChannel(
          personalMsg.channel
        );
        expect(extractedUserId).toBe(viewerUserId);
      }
    });
  });

  describe("Redis key infrastructure", () => {
    it("should generate consistent keys between redisKeys and channels", () => {
      expect(redisKeys.meetingAlertShared(sessionId) as any).toBe(
        sharedAlertChannel(sessionId)
      );
      expect(
        redisKeys.meetingAlertPersonal(sessionId, viewerUserId) as any
      ).toBe(personalAlertChannel(sessionId, viewerUserId));
    });

    it("should have appropriate TTL values for alert keys", () => {
      expect(TTL.ALERT_SHARED).toBe(1800);
      expect(TTL.ALERT_PERSONAL).toBe(1800);
      expect(TTL.COMMITMENT_LEDGER).toBe(7200);
      expect(TTL.SPEAKER_STATE).toBe(7200);
    });
  });

  describe("All 12 alert categories routing verification", () => {
    const allCategories: AlertCategory[] = [
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

    it("should have a valid routing for every category with own speech", () => {
      for (const category of allCategories) {
        const routing = resolveAlertRouting({
          category,
          speaker: createTeamSpeaker(viewerUserId, "Alice"),
          viewerUserId,
        });
        expect(["shared", "personal", "both"]).toContain(routing);
      }
    });

    it("should have a valid routing for every category with external speech", () => {
      for (const category of allCategories) {
        const routing = resolveAlertRouting({
          category,
          speaker: createExternalSpeaker("Client"),
          viewerUserId,
        });
        expect(["shared", "personal", "both"]).toContain(routing);
      }
    });

    it("should have a priority value for every category", () => {
      for (const category of allCategories) {
        expect(ALERT_PRIORITY[category]).toBeDefined();
        expect(ALERT_PRIORITY[category]).toBeGreaterThanOrEqual(1);
        expect(ALERT_PRIORITY[category]).toBeLessThanOrEqual(12);
      }
    });
  });
});
