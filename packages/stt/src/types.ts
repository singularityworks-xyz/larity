/**
 * types.ts — STT Package Type Definitions
 *
 * Defines the shape of audio frames received from Redis
 * and transcript payloads published back.
 *
 * The STT layer emits raw diarization indices from Deepgram.
 * Speaker identification (resolving indices to team/external)
 * happens downstream in the meeting-mode pipeline.
 */

/**
 * Audio source identifier — which audio stream this came from.
 * With the host model, system audio is the primary source
 * (Google Meet tab capture from the host machine).
 */
export type AudioSource = "mic" | "system";

/**
 * Audio frame payload as received from Redis
 * Matches the format published by apps/realtime
 */
export interface AudioPayload {
  sessionId: string;
  ts: number;
  frame: string; // Base64-encoded audio buffer
  source?: AudioSource; // Optional for backwards compatibility
}

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
  start: number; // Seconds from Deepgram
  duration: number;
  ts: number; // Unix timestamp when processed
}
