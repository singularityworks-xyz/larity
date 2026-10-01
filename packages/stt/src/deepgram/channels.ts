// OUTPUT CHANNELS (to downstream consumers)

/**
 * Channel prefix for STT output
 */
const STT_PREFIX = "meeting.stt";

/**
 * Final transcript channel for a session.
 *
 * Uses an explicit `final` segment so Redis pattern subscribers can listen
 * on disjoint patterns (`meeting.stt.final.*` vs `meeting.stt.partial.*`).
 * The old `meeting.stt.*` pattern also matched partial channels, causing
 * every partial to be delivered — and processed — twice.
 */
export function transcriptChannel(sessionId: string): string {
  return `${STT_PREFIX}.final.${sessionId}`;
}

/**
 * Partial/interim transcript channel for a session
 */
export function partialChannel(sessionId: string): string {
  return `${STT_PREFIX}.partial.${sessionId}`;
}
