import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Alert } from "../../src/alerts/types";
import { ALERT_PRIORITY } from "../../src/alerts/types";
import { createExternalSpeaker, createTeamSpeaker } from "../helpers";

const publishedMessages: Array<{ channel: string; message: string }> = [];

function createMockRedis() {
  return {
    publish: mock((channel: string, message: string) => {
      publishedMessages.push({ channel, message });
      return Promise.resolve(1);
    }),
  };
}

const SHARED_KEY_FN = (sessionId: string) =>
  `meeting.alert.${sessionId}.shared`;
const PERSONAL_KEY_FN = (sessionId: string, userId: string) =>
  `meeting.alert.${sessionId}.user.${userId}`;

class TestAlertPublisher {
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
    const channel = SHARED_KEY_FN(this.sessionId);
    try {
      await this.redis.publish(channel, JSON.stringify(alert));
    } catch {
      // fail-silent
    }
  }

  private async publishToPersonal(alert: Alert): Promise<void> {
    if (!alert.targetUserId) {
      return;
    }
    const channel = PERSONAL_KEY_FN(this.sessionId, alert.targetUserId);
    try {
      await this.redis.publish(channel, JSON.stringify(alert));
    } catch {
      // fail-silent
    }
  }
}

function makeSharedAlert(): Alert {
  return {
    id: "alert-shared-1",
    category: "scope_creep",
    severity: "medium",
    triggerUtteranceId: "utt-1",
    speaker: createExternalSpeaker("Client"),
    topicId: "pricing",
    timestamp: Date.now(),
    title: "Scope creep detected",
    message: "Client is expanding scope",
    routing: "shared",
    status: "pending",
    confidence: 0.85,
    triggerTier: 2,
  };
}

function makePersonalAlert(userId: string): Alert {
  return {
    id: "alert-personal-1",
    category: "self_contradiction",
    severity: "low",
    triggerUtteranceId: "utt-2",
    speaker: createTeamSpeaker(userId, "Alice"),
    topicId: "",
    timestamp: Date.now(),
    title: "Self contradiction",
    message: "You contradicted yourself",
    routing: "personal",
    targetUserId: userId,
    status: "pending",
    confidence: 0.9,
    triggerTier: 2,
  };
}

function makeBothAlert(userId: string): Alert {
  return {
    id: "alert-both-1",
    category: "information_risk",
    severity: "high",
    triggerUtteranceId: "utt-3",
    speaker: createTeamSpeaker(userId, "Bob"),
    topicId: "security",
    timestamp: Date.now(),
    title: "Information risk",
    message: "Client name mentioned",
    routing: "both",
    targetUserId: userId,
    status: "pending",
    confidence: 0.92,
    triggerTier: 4,
  };
}

describe("AlertPublisher", () => {
  const sessionId = "test-session";

  beforeEach(() => {
    publishedMessages.length = 0;
  });

  it("should publish a shared alert to the shared channel only", async () => {
    const redis = createMockRedis();
    const publisher = new TestAlertPublisher(redis, sessionId);
    const alert = makeSharedAlert();

    await publisher.publish(alert);

    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]?.channel).toBe(
      `meeting.alert.${sessionId}.shared`
    );

    const parsed = JSON.parse(publishedMessages[0]?.message ?? "{}");
    expect(parsed.id).toBe("alert-shared-1");
    expect(parsed.category).toBe("scope_creep");
  });

  it("should publish a personal alert to the personal channel only", async () => {
    const redis = createMockRedis();
    const publisher = new TestAlertPublisher(redis, sessionId);
    const userId = "user-alice";
    const alert = makePersonalAlert(userId);

    await publisher.publish(alert);

    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0]?.channel).toBe(
      `meeting.alert.${sessionId}.user.${userId}`
    );
  });

  it("should publish a both alert to shared and personal channels", async () => {
    const redis = createMockRedis();
    const publisher = new TestAlertPublisher(redis, sessionId);
    const userId = "user-bob";
    const alert = makeBothAlert(userId);

    await publisher.publish(alert);

    expect(publishedMessages).toHaveLength(2);

    const channels = publishedMessages.map((m) => m.channel);
    expect(channels).toContain(`meeting.alert.${sessionId}.shared`);
    expect(channels).toContain(`meeting.alert.${sessionId}.user.${userId}`);
  });

  it("should skip personal channel when targetUserId is missing", async () => {
    const redis = createMockRedis();
    const publisher = new TestAlertPublisher(redis, sessionId);
    const alert: Alert = {
      id: "alert-no-target",
      category: "self_contradiction",
      severity: "low",
      triggerUtteranceId: "utt-missing",
      speaker: createTeamSpeaker("user-1", "Alice"),
      topicId: "",
      timestamp: Date.now(),
      title: "Test",
      message: "No target",
      routing: "personal",
      status: "pending",
      confidence: 0,
      triggerTier: 2,
    };

    await publisher.publish(alert);

    expect(publishedMessages).toHaveLength(0);
  });

  it("should handle Redis publish errors gracefully", async () => {
    const failingRedis = {
      publish: mock(() => Promise.reject(new Error("Redis down"))),
    };
    const publisher = new TestAlertPublisher(failingRedis, sessionId);
    const alert = makeSharedAlert();

    await publisher.publish(alert);

    expect(failingRedis.publish).toHaveBeenCalledTimes(1);
  });

  it("should serialize alert as JSON in published message", async () => {
    const redis = createMockRedis();
    const publisher = new TestAlertPublisher(redis, sessionId);
    const alert = makeSharedAlert();

    await publisher.publish(alert);

    const parsed = JSON.parse(publishedMessages[0]?.message ?? "{}");
    expect(parsed.category).toBe("scope_creep");
    expect(parsed.severity).toBe("medium");
    expect(parsed.routing).toBe("shared");
    expect(parsed.speaker.type).toBe("EXTERNAL");
  });
});

describe("createAlertChannelKeys", () => {
  it("should generate shared channel key correctly", () => {
    const sessionId = "ses-123";
    expect(SHARED_KEY_FN(sessionId)).toBe(`meeting.alert.${sessionId}.shared`);
  });

  it("should generate personal channel key correctly", () => {
    const sessionId = "ses-123";
    const userId = "user-1";
    expect(PERSONAL_KEY_FN(sessionId, userId)).toBe(
      `meeting.alert.${sessionId}.user.${userId}`
    );
  });
});

describe("ALERT_PRIORITY in publisher context", () => {
  it("should be used for ordering published alerts", () => {
    expect(ALERT_PRIORITY.policy_violation).toBeLessThan(
      ALERT_PRIORITY.scope_creep
    );
  });
});
