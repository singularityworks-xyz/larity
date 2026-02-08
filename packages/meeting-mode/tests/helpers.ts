import type { SttResult } from "../../stt/src/types";
import type { SpeakerIdentity, Utterance } from "../src/utterance/types";

/**
 * Create a test SpeakerIdentity with sensible defaults.
 */
export function createTestSpeaker(
  overrides: Partial<SpeakerIdentity> = {}
): SpeakerIdentity {
  return {
    speakerId: "spk_0",
    type: "EXTERNAL",
    name: "Speaker 1",
    diarizationIndex: 0,
    isCurrentUser: false,
    confidence: 0,
    ...overrides,
  };
}

/**
 * Create a TEAM speaker identity.
 */
export function createTeamSpeaker(
  userId: string,
  name: string,
  overrides: Partial<SpeakerIdentity> = {}
): SpeakerIdentity {
  return createTestSpeaker({
    type: "TEAM",
    userId,
    name,
    confidence: 0.95,
    ...overrides,
  });
}

/**
 * Create an EXTERNAL speaker identity.
 */
export function createExternalSpeaker(
  name: string,
  overrides: Partial<SpeakerIdentity> = {}
): SpeakerIdentity {
  return createTestSpeaker({
    type: "EXTERNAL",
    name,
    confidence: 0.8,
    ...overrides,
  });
}

let utteranceSeq = 0;

/**
 * Create a test Utterance with sensible defaults.
 */
export function createTestUtterance(
  overrides: Partial<Utterance> = {}
): Utterance {
  const seq = utteranceSeq++;
  return {
    utteranceId: `test-session:${seq}`,
    sessionId: "test-session",
    speaker: createTestSpeaker(),
    text: `Test utterance ${seq}`,
    timestamp: Date.now(),
    confidenceScore: 0.95,
    startOffset: seq * 5,
    duration: 3.5,
    wordCount: 3,
    mergedCount: 1,
    ...overrides,
  };
}

/**
 * Create a test SttResult with sensible defaults.
 */
export function createTestSttResult(
  overrides: Partial<SttResult> = {}
): SttResult {
  return {
    sessionId: "test-session",
    isFinal: true,
    transcript: "Hello world.",
    confidence: 0.95,
    diarizationIndex: 0,
    start: 0,
    duration: 2.5,
    ts: Date.now(),
    ...overrides,
  };
}

/**
 * Reset the utterance sequence counter (call in beforeEach).
 */
export function resetUtteranceSeq(): void {
  utteranceSeq = 0;
}
