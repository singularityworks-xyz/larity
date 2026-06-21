import { redis } from "./client";
import { redisKeys } from "./keys";

export interface SystemEventPayload {
  code: string;
  eventId: string;
  message: string;
  severity: "info" | "warning" | "error";
  source: "deepgram" | "sambanova" | "gemini";
  timestamp: number;
  type: "system_event";
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
