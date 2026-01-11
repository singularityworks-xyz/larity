/**
 * deepgram/types.ts — Deepgram Event Types
 *
 * Type definitions for Deepgram live transcription responses.
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
}

/**
 * Default configuration for live transcription
 * Assumes linear16 @ 16kHz mono (common for speech)
 */
export const DEFAULT_DG_CONFIG = {
  model: 'nova-3',
  language: 'en-US',
  punctuate: true,
  interim_results: true,
  smart_format: true,
  endpointing: 600, // 300ms silence = end of utterance
  vad_events: true,
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
  keepAlive: true, // Prevent idle disconnections
} as const;

/**
 * Deepgram transcript alternative
 */
export interface TranscriptAlternative {
  transcript: string;
  confidence: number;
  words?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
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
  type: 'Results';
  channel_index: number[];
  duration: number;
  start: number;
  is_final: boolean;
  speech_final: boolean;
  channel: ChannelResult;
}
