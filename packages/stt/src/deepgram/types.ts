/**
 * deepgram/types.ts — Deepgram Event Types
 *
 * Type definitions for Deepgram live transcription responses.
 * Includes diarization support for multi-speaker identification.
 */

/**
 * Default configuration for live transcription
 * Assumes linear16 @ 16kHz mono (common for speech)
 *
 * diarize=true enables speaker diarization — Deepgram assigns
 * speaker indices (0, 1, 2...) to each word/segment.
 *
 * Note: v5 SDK requires boolean options as string literals.
 */
export const DEFAULT_DG_CONFIG = {
  model: "nova-3",
  language: "multi",
  punctuate: "true",
  interim_results: "true",
  smart_format: "true",
  endpointing: "100", // 1200ms silence = end of utterance
  vad_events: "true",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
  diarize: "true",
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
 * Deepgram transcript result event (v5 ListenV1Results shape)
 */
export interface TranscriptResult {
  type: "Results";
  channel_index: number[];
  duration: number;
  start: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel: ChannelResult;
}
