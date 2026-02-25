/**
 * redis/channels.ts — Naming Contract
 *
 * Defines Redis channel names for the realtime plane.
 *
 * Purpose:
 * - Enforce consistent Redis topics
 * - Avoid string duplication
 * - Make cross-service integration predictable
 *
 * Nothing dynamic lives here except naming functions.
 */

/**
 * Channel prefix for all realtime plane events
 */
const PREFIX = "realtime";

/**
 * Per-session audio stream channel
 * Used for publishing raw audio frames for a specific session
 */
export function audioChannel(sessionId: string): string {
  return `${PREFIX}.audio.${sessionId}`;
}

/**
 * Channel for processed utterances (to be broadcast to all participants)
 */
export function utteranceChannel(sessionId: string): string {
  return `meeting.utterance.${sessionId}`;
}

/**
 * Channel for shared alerts (to be broadcast to all participants)
 */
export function sharedAlertChannel(sessionId: string): string {
  return `meeting.alert.${sessionId}.shared`;
}

/**
 * Channel for personal alerts (to be sent to a specific user)
 */
export function personalAlertChannel(
  sessionId: string,
  userId: string
): string {
  return `meeting.alert.${sessionId}.user.${userId}`;
}

/**
 * Channel for topic change events
 */
export function topicChannel(sessionId: string): string {
  return `meeting.topic.${sessionId}`;
}

/**
 * Global session start event channel
 * Published when a new WebSocket connection is established
 */
export const SESSION_START = `${PREFIX}.session.start`;

/**
 * Global session end event channel
 * Published when a WebSocket connection closes
 */
export const SESSION_END = `${PREFIX}.session.end`;

/**
 * Participant join event
 */
export const PARTICIPANT_JOIN = `${PREFIX}.participant.join`;

/**
 * Participant leave event
 */
export const PARTICIPANT_LEAVE = `${PREFIX}.participant.leave`;

/**
 * All channel names for documentation/debugging
 */
export const channels = {
  audioChannel,
  utteranceChannel,
  sharedAlertChannel,
  personalAlertChannel,
  topicChannel,
  SESSION_START,
  SESSION_END,
  PARTICIPANT_JOIN,
  PARTICIPANT_LEAVE,
} as const;
