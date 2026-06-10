/**
 * types.ts — STT Package Type Definitions
 *
 * The STT layer emits raw diarization indices from Deepgram.
 * Speaker identification (resolving indices to team/external)
 * happens downstream in the meeting-mode pipeline.
 */

/**
 * Session start event from realtime plane
 */
export interface SessionStartEvent {
  sessionId: string;
  ts: number;
}

/**
 * Session end event from realtime plane
 */
export interface SessionEndEvent {
  sessionId: string;
  ts: number;
  duration: number;
}

/**
 * STT result payload published to Redis
 *
 * The STT layer emits diarizationIndex (Deepgram's arbitrary speaker
 * integer) rather than resolved speaker identities. Speaker identification
 * happens downstream via voice embeddings.
 */
export interface SttResult {
  sessionId: string;
  isFinal: boolean;
  transcript: string;
  confidence: number;
  diarizationIndex: number; // Deepgram speaker index (0, 1, 2...)
  channel: number; // 0 for host mic, 1 for loopback
  start: number; // Seconds from Deepgram
  duration: number;
  ts: number; // Unix timestamp when processed
  speechTimestamp: number; // Absolute Unix ms of speech (connectionStartTime + start*1000)
}
