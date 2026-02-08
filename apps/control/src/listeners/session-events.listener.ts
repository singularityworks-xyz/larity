import Redis from "ioredis";
import { createControlLogger } from "../logger";
import { meetingSessionService } from "../services/meeting-session.service";

const log = createControlLogger("session-listener");

// Redis channels to subscribe to
const SESSION_START = "realtime.session.start";
const SESSION_END = "realtime.session.end";

let subscriber: Redis | null = null;

interface SessionStartEvent {
  sessionId: string;
  ts: number;
}

interface SessionEndEvent {
  sessionId: string;
  ts: number;
  duration: number;
}

/**
 * Handle session start event from realtime server
 *
 * When the realtime server receives a WebSocket connection,
 * it publishes this event. We use it to confirm the session is active.
 */
async function handleSessionStart(event: SessionStartEvent): Promise<void> {
  const { sessionId, ts } = event;

  log.info({ sessionId, ts }, "Session started");

  // Verify session exists in our Redis state
  const isValid = await meetingSessionService.isValidSession(sessionId);

  if (!isValid) {
    log.warn({ sessionId }, "Unknown session started");
    // In production, you might want to forcefully close this session
    return;
  }

  // Update session activity
  await meetingSessionService.updateActivity(sessionId);
}

/**
 * Handle session end event from realtime server
 *
 * When the WebSocket disconnects, the realtime server publishes this.
 * We use it to clean up and potentially end the meeting.
 */
async function handleSessionEnd(event: SessionEndEvent): Promise<void> {
  const { sessionId, ts, duration } = event;

  log.info({ sessionId, ts, duration }, "Session ended");

  // Get session status
  const status = await meetingSessionService.getStatus(sessionId);

  if (!status) {
    // Session already cleaned up, nothing to do
    return;
  }

  // If session was active (not already ending), end it
  if (status.status === "active" || status.status === "initializing") {
    try {
      await meetingSessionService.end(
        { sessionId, reason: "timeout" },
        "system" // System-initiated end
      );
      log.info({ sessionId }, "Auto-ended session");
    } catch (error) {
      log.error({ sessionId, err: error }, "Failed to auto-end session");
    }
  }
}

/**
 * Start listening to session events from Redis
 */
export async function startSessionEventListener(): Promise<void> {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  subscriber = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  });

  await subscriber.connect();
  log.info("Connected to Redis");

  // Subscribe to session channels
  await subscriber.subscribe(SESSION_START, SESSION_END);
  log.info(
    { channels: [SESSION_START, SESSION_END] },
    "Subscribed to channels"
  );

  // Handle incoming messages
  subscriber.on("message", async (channel: string, message: string) => {
    try {
      const event = JSON.parse(message);

      switch (channel) {
        case SESSION_START:
          await handleSessionStart(event as SessionStartEvent);
          break;
        case SESSION_END:
          await handleSessionEnd(event as SessionEndEvent);
          break;
        default:
          log.warn({ channel }, "Unknown channel");
      }
    } catch (error) {
      log.error({ err: error, channel }, "Error handling message");
    }
  });

  subscriber.on("error", (error) => {
    log.error({ err: error }, "Redis error");
  });
}

/**
 * Stop listening to session events
 */
export async function stopSessionEventListener(): Promise<void> {
  if (subscriber) {
    await subscriber.unsubscribe();
    subscriber.disconnect();
    subscriber = null;
    log.info("Stopped");
  }
}
