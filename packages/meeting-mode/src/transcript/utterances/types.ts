export type SpeakerType = "TEAM" | "EXTERNAL";

export interface SpeakerIdentity {
  confidence: number;

  diarizationIndices: number[];

  isCurrentUser: boolean;

  isHost?: boolean;

  name: string;
  speakerId: string;

  type: SpeakerType;

  userId?: string;
}

export interface Utterance {
  confidenceScore: number;
  duration: number;
  embedding?: number[];
  embeddingPromise?: Promise<number[] | undefined>;
  mergedCount: number;
  sessionId: string;
  speaker: SpeakerIdentity;
  startOffset: number;
  text: string;
  timestamp: number;
  topicId?: string;
  utteranceId: string;
  wordCount: number;
}

export function createUnidentifiedSpeaker(
  diarizationIndex: number
): SpeakerIdentity {
  return {
    speakerId: `spk_${diarizationIndex}`,
    type: "EXTERNAL",
    name: `Speaker ${diarizationIndex + 1}`,
    diarizationIndices: [diarizationIndex],
    isCurrentUser: false,
    confidence: 0,
  };
}
