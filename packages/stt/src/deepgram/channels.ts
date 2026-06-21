// OUTPUT CHANNELS (to downstream consumers)

/**
 * Channel prefix for STT output
 */
const STT_PREFIX = "meeting.stt";

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
