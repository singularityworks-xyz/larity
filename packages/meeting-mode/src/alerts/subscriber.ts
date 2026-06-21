import { redisKeys } from "@larity/db/redis/keys";
import Redis from "ioredis";
import { REDIS_URL } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Alert } from "./types";

const log = createMeetingModeLogger("alert-subscriber");

export interface AlertHandlers {
  onPersonalAlert: (alert: Alert) => void;
  onSharedAlert: (alert: Alert) => void;
}

export class AlertSubscriber {
  private subscriber: Redis | null = null;
  private handlers: AlertHandlers | null = null;
  private readonly sessionId: string;
  private readonly userId: string;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  async start(handlers: AlertHandlers): Promise<void> {
    this.handlers = handlers;

    this.subscriber = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      showFriendlyErrorStack: true,
    });

    this.subscriber.on("error", (err) => {
      log.error({ err }, "Alert subscriber Redis error");
    });

    this.subscriber.on("reconnecting", () => {
      log.warn("Alert subscriber reconnecting to Redis...");
    });

    await this.subscriber.connect();

    const sharedChannel = redisKeys.meetingAlertShared(this.sessionId);
    const personalChannel = redisKeys.meetingAlertPersonal(
      this.sessionId,
      this.userId
    );

    await this.subscriber.subscribe(sharedChannel, personalChannel);

    this.subscriber.on("message", (channel, message) => {
      this.handleMessage(channel, message);
    });

    log.info(
      { sessionId: this.sessionId, userId: this.userId },
      "Alert subscriber started"
    );
  }

  async stop(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
      this.handlers = null;
      log.info({ sessionId: this.sessionId }, "Alert subscriber stopped");
    }
  }

  private handleMessage(channel: string, message: string): void {
    if (!this.handlers) {
      return;
    }

    let alert: Alert;
    try {
      alert = JSON.parse(message) as Alert;
    } catch {
      log.error({ channel }, "Failed to parse alert message");
      return;
    }

    const sharedChannel = redisKeys.meetingAlertShared(this.sessionId);
    const personalChannel = redisKeys.meetingAlertPersonal(
      this.sessionId,
      this.userId
    );

    if (channel === sharedChannel) {
      this.handlers.onSharedAlert(alert);
      return;
    }

    if (channel === personalChannel) {
      this.handlers.onPersonalAlert(alert);
      return;
    }

    log.warn({ channel }, "Received message on unexpected channel");
  }

  isActive(): boolean {
    return this.subscriber !== null && this.subscriber.status === "ready";
  }
}
