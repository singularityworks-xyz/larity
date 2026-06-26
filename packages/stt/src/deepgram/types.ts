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
  // "en" gives better-calibrated VAD and endpointing than "multi".
  // Deepgram nova-3 still auto-detects other languages when they appear;
  // "en" only sets the primary/default language.
  language: "en",
  punctuate: "true",
  interim_results: "true",
  smart_format: "true",
  // 450ms silence reliably captures natural sentence-ending pauses without
  // eating into mid-sentence breaths (which are typically 200-400ms), while
  // avoiding false cutoffs on dramatic pauses.
  endpointing: "450",
  vad_events: "true",
  // UtteranceEnd fires after this many ms of silence following a speech segment.
  // Acts as the primary flush signal for the accumulator, replacing the old
  // safety-timer approach which was fragile and could delay output by 5 seconds.
  utterance_end_ms: "1000",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
  diarize: "true",
} as const;

/**
 * Deepgram word with optional speaker diarization index
 */
export interface DeepgramWord {
  confidence: number;
  end: number;
  /** Speaker index from diarization (0, 1, 2...). Present when diarize=true. */
  speaker?: number;
  start: number;
  word: string;
}

/**
 * Deepgram transcript alternative
 */
export interface TranscriptAlternative {
  confidence: number;
  transcript: string;
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
  channel: ChannelResult;
  channel_index: number[];
  duration: number;
  is_final?: boolean;
  speech_final?: boolean;
  start: number;
  type: "Results";
}
