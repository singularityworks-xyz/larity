/**
 * deepgram/types.ts — Deepgram Event Types
 *
 * Type definitions for Deepgram live transcription responses.
 * Includes diarization support for multi-speaker identification.
 */

/**
 * Deepgram live transcription configuration
 */
export interface DeepgramLiveConfig {
  model: string;
  language: string;
  punctuate: boolean;
  interim_results: boolean;
  smart_format: boolean;
  endpointing: number;
  vad_events: boolean;
  encoding: string;
  sample_rate: number;
  channels: number;
  diarize: boolean;
}

/**
 * Default configuration for live transcription
 * Assumes linear16 @ 16kHz mono (common for speech)
 *
 * diarize=true enables speaker diarization — Deepgram assigns
 * speaker indices (0, 1, 2...) to each word/segment.
 */
export const DEFAULT_DG_CONFIG = {
  model: "nova-3",
  language: "en-US",
  punctuate: true,
  interim_results: true,
  smart_format: true,
  endpointing: 600, // 600ms silence = end of utterance
  vad_events: true,
  encoding: "linear16",
  sample_rate: 16_000,
  channels: 1,
  keepAlive: true, // Prevent idle disconnections
  diarize: true, // Enable speaker diarization
} as const;

/**
 * Deepgram word with optional speaker diarization index
 */
export interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  /** Speaker index from diarization (0, 1, 2...). Present when diarize=true. */
  speaker?: number;
}

/**
 * Deepgram transcript alternative
 */
export interface TranscriptAlternative {
  transcript: string;
  confidence: number;
  words?: DeepgramWord[];
}

/**
 * Deepgram channel result
 */
export interface ChannelResult {
  alternatives: TranscriptAlternative[];
}

/**
 * Deepgram transcript result event
 */
export interface TranscriptResult {
  type: "Results";
  channel_index: number[];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: ChannelResult;
}
