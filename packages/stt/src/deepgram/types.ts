export const DEFAULT_DG_CONFIG = {
  model: "nova-3",
  language: "en",
  punctuate: "true",
  interim_results: "true",
  smart_format: "true",
  endpointing: "450",
  vad_events: "true",
  utterance_end_ms: "1000",
  encoding: "linear16",
  sample_rate: "16000",
  channels: "1",
  diarize: "true",
} as const;

export interface DeepgramWord {
  confidence: number;
  end: number;
  speaker?: number;
  start: number;
  word: string;
}

export interface TranscriptAlternative {
  confidence: number;
  transcript: string;
  words?: DeepgramWord[];
}

export interface ChannelResult {
  alternatives: TranscriptAlternative[];
}

export interface TranscriptResult {
  channel: ChannelResult;
  channel_index: number[];
  duration: number;
  is_final?: boolean;
  speech_final?: boolean;
  start: number;
  type: "Results";
}
