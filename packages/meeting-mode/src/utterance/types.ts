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
  /** Unique within this meeting session (e.g. "spk_0", "spk_1") */
  speakerId: string;

  /** Whether this speaker is a team member or external */
  type: SpeakerType;

  /** If TEAM, linked to the User record */
  userId?: string;

  /** Display name (team member name or "Speaker 1", "Client", etc.) */
  name: string;

  /** Deepgram's diarization speaker integer (0, 1, 2...) */
  diarizationIndex?: number;

  /** Is this the person viewing this Larity instance? */
  isCurrentUser: boolean;

  /** Confidence of the speaker identification (0-1) */
  confidence: number;
}

export interface Utterance {
  utteranceId: string;
  sessionId: string;
  speaker: SpeakerIdentity;
  text: string;
  timestamp: number;
  confidenceScore: number;
  startOffset: number;
  duration: number;
  wordCount: number;
  mergedCount: number;
  topicId?: string;
}

export interface FinalizeResult {
  text: string;
  confidence: number;
  timestamp: number;
  duration: number;
  startOffset: number;
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
    diarizationIndex,
    isCurrentUser: false,
    confidence: 0,
  };
}
