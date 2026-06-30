/**
 * Speaker type classification
 *
 * TEAM — identified team member (matched via voiceprint)
 * EXTERNAL — client or unidentified speaker (conservative default)
 */
export type SpeakerType = "TEAM" | "EXTERNAL";

/**
 * Speaker identity for multi-user meeting sessions.
 *
 * Replaces the binary "YOU" | "THEM" model entirely.
 * Speakers are identified via voice embeddings compared against
 * team voiceprints. Unidentified speakers default to EXTERNAL.
 */
export interface SpeakerIdentity {
  /** Confidence of the speaker identification (0-1) */
  confidence: number;

  /** Deepgram's diarization speaker integers (e.g. 0, 1, 2...) */
  diarizationIndices: number[];

  /** Is this the person viewing this Larity instance? */
  isCurrentUser: boolean;

  /** Is this speaker the host? */
  isHost?: boolean;

  /** Display name (team member name or "Speaker 1", "Client", etc.) */
  name: string;
  /** Unique within this meeting session (e.g. "spk_0", "spk_1") */
  speakerId: string;

  /** Whether this speaker is a team member or external */
  type: SpeakerType;

  /** If TEAM, linked to the User record */
  userId?: string;
}

export interface Utterance {
  confidenceScore: number;
  duration: number;
  embedding?: number[];
  /** In-flight embedding for topic assignment; never serialized over Redis */
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

export interface FinalizeResult {
  confidence: number;
  duration: number;
  startOffset: number;
  text: string;
  timestamp: number;
}

/**
 * Create an unidentified external speaker identity.
 *
 * Used as the conservative default when speaker identification
 * has not yet resolved (first 30-60s of a meeting).
 */
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
