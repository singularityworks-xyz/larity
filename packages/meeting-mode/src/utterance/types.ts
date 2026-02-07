export type Speaker = "YOU" | "THEM";

export interface Utterance {
  utteranceId: string;
  sessionId: string;
  speaker: Speaker;
  text: string;
  timestamp: number;
  confidenceScore: number;
  startOffset: number;
  duration: number;
  wordCount: number;
  mergedCount: number;
}

export interface FinalizeResult {
  text: string;
  confidence: number;
  timestamp: number;
  duration: number;
  startOffset: number;
}
