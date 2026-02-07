import Redis from "ioredis";
import { meetingSessionService } from "../services/meeting-session.service";

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

  console.log(`[SessionListener] Session started: ${sessionId} at ${ts}`);

  // Verify session exists in our Redis state
  const isValid = await meetingSessionService.isValidSession(sessionId);

  if (!isValid) {
    console.warn(`[SessionListener] Unknown session started: ${sessionId}`);
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

  console.log(
    `[SessionListener] Session ended: ${sessionId} ` +
      `(duration: ${duration}ms, at: ${ts})`
  );

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
      console.log(`[SessionListener] Auto-ended session: ${sessionId}`);
    } catch (error) {
      console.error("[SessionListener] Failed to auto-end session:", error);
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
  console.log("[SessionListener] Connected to Redis");

  // Subscribe to session channels
  await subscriber.subscribe(SESSION_START, SESSION_END);
  console.log(
    `[SessionListener] Subscribed to ${SESSION_START}, ${SESSION_END}`
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
          console.warn(`[SessionListener] Unknown channel: ${channel}`);
      }
    } catch (error) {
      console.error("[SessionListener] Error handling message:", error);
    }
  });

  subscriber.on("error", (error) => {
    console.error("[SessionListener] Redis error:", error);
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
    console.log("[SessionListener] Stopped");
  }
}
