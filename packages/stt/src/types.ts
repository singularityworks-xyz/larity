/**
 * types.ts — STT Package Type Definitions
 *
 * Defines the shape of audio frames received from Redis
 * and transcript payloads published back.
 */

/**
 * Audio source identifier for speaker tagging
 */
export type AudioSource = "mic" | "system";

/**
 * Speaker tag in output transcripts
 */
export type Speaker = "YOU" | "THEM";

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
 * Matches meeting-mode.md specification
 */
export interface SttResult {
  sessionId: string;
  isFinal: boolean;
  transcript: string;
  confidence: number;
  speaker: Speaker;
  start: number; // Seconds from Deepgram
  duration: number;
  ts: number; // Unix timestamp when processed
}
