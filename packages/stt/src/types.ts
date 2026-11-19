export interface SessionStartEvent {
  sessionId: string;
  ts: number;
}

export interface SessionEndEvent {
  duration: number;
  sessionId: string;
  ts: number;
}

/**
 * STT result payload published to Redis
 *
 * The STT layer emits diarizationIndex (Deepgram's arbitrary speaker
 * integer) rather than resolved speaker identities. Speaker identification
 * happens downstream via voice embeddings.
 */
export interface SttResult {
  channel: number;
  confidence: number;
  diarizationIndex: number;
  duration: number;
  isFinal: boolean;
  sessionId: string;
  speechTimestamp: number; // Absolute Unix ms of speech (connectionStartTime + start*1000)
  start: number; // Seconds from Deepgram
  transcript: string;
  ts: number; // Unix timestamp when processed
  /**
   * Envelope type for Redis pub/sub (P5.1). Set by the publisher so the
   * realtime subscriber can forward the payload verbatim without
   * parse+spread+stringify per message.
   */
  type: "stt_partial" | "stt_final";
}
