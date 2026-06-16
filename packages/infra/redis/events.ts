import { redis } from "./client";
import { redisKeys } from "./keys";

export interface SystemEventPayload {
  type: "system_event";
  eventId: string;
  source: "deepgram" | "sambanova" | "gemini";
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  timestamp: number;
}

export async function publishSystemEvent(
  sessionId: string,
  event: Omit<SystemEventPayload, "type" | "eventId" | "timestamp">
): Promise<void> {
  const payload: SystemEventPayload = {
    type: "system_event",
    eventId: crypto.randomUUID(),
    timestamp: Date.now(),
    ...event,
  };

  try {
    const channel = redisKeys.meetingSystemEvent(sessionId);
    await redis.publish(channel, JSON.stringify(payload));
  } catch (err) {
    // Fail-silent logging
    console.error(
      `Failed to publish system event for session ${sessionId}:`,
      err
    );
  }
}
