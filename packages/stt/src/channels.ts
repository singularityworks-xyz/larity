// INPUT CHANNELS (from realtime plane)

/**
 * Channel prefix for realtime plane events
 */
const REALTIME_PREFIX = 'realtime';

/**
 * Session start event channel
 */
export const SESSION_START = `${REALTIME_PREFIX}.session.start`;

/**
 * Session end event channel
 */
export const SESSION_END = `${REALTIME_PREFIX}.session.end`;

/**
 * Audio channel pattern for psubscribe
 */
export const AUDIO_PATTERN = `${REALTIME_PREFIX}.audio.*`;

// OUTPUT CHANNELS (to downstream consumers)

/**
 * Channel prefix for STT output
 */
const STT_PREFIX = 'meeting.stt';

/**
 * Final transcript channel for a session
 */
export function transcriptChannel(sessionId: string): string {
  return `${STT_PREFIX}.${sessionId}`;
}

/**
 * Partial/interim transcript channel for a session
 */
export function partialChannel(sessionId: string): string {
  return `${STT_PREFIX}.partial.${sessionId}`;
}
