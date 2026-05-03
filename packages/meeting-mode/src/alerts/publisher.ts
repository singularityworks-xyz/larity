import { redisKeys } from "@larity/infra/redis/keys";
import type { Redis } from "ioredis";
import { createMeetingModeLogger } from "../logger";
import type { Alert } from "./types";

const log = createMeetingModeLogger("alert-publisher");

export interface AlertPublisherConfig {
  redis: Redis;
  sessionId: string;
}

export class AlertPublisher {
  private readonly redis: Redis;
  private readonly sessionId: string;

  constructor(config: AlertPublisherConfig) {
    this.redis = config.redis;
    this.sessionId = config.sessionId;
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
        log.warn(
          { routing: alert.routing, alertId: alert.id },
          "Unknown alert routing, skipping"
        );
    }

    await Promise.all(tasks);
  }

  private async publishToShared(alert: Alert): Promise<void> {
    const channel = redisKeys.meetingAlertShared(this.sessionId);

    try {
      await this.redis.publish(channel, JSON.stringify(alert));
      log.debug(
        { alertId: alert.id, category: alert.category, channel },
        "Published shared alert"
      );
    } catch (error) {
      log.error(
        { err: error, alertId: alert.id, channel },
        "Failed to publish shared alert"
      );
    }
  }

  private async publishToPersonal(alert: Alert): Promise<void> {
    if (!alert.targetUserId) {
      log.warn(
        { alertId: alert.id, category: alert.category },
        "Personal alert missing targetUserId, skipping personal channel"
      );
      return;
    }

    const channel = redisKeys.meetingAlertPersonal(
      this.sessionId,
      alert.targetUserId
    );

    try {
      await this.redis.publish(channel, JSON.stringify(alert));
      log.debug(
        {
          alertId: alert.id,
          category: alert.category,
          channel,
          targetUserId: alert.targetUserId,
        },
        "Published personal alert"
      );
    } catch (error) {
      log.error(
        { err: error, alertId: alert.id, channel },
        "Failed to publish personal alert"
      );
    }
  }
}

export function createAlertChannelKeys(sessionId: string): {
  shared: string;
  personal: (userId: string) => string;
} {
  return {
    shared: redisKeys.meetingAlertShared(sessionId),
    personal: (userId: string) =>
      redisKeys.meetingAlertPersonal(sessionId, userId),
  };
}
