export interface Utterance {
  utteranceId: string;
  sessionId: string;
  speaker: 'YOU' | 'THEM';
  text: string;
  timestamp: number;
  confidenceScore: number;
  startOffset: number;
  duration: number;
  wordCount: number;
  mergedCount: number;
}
