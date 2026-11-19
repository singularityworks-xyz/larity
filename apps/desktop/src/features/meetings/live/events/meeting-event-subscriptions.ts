import type {
  AudioStreamingClient,
  IncomingMessageHandler,
  IncomingMessageType,
} from "../capture/audio-streaming";

export const MEETING_STREAM_EVENT_TYPES = [
  "utterance",
  "topic",
  "ledger",
  "stt_partial",
  "stt_final",
  "alert",
  "participant_event",
  "meeting_processed",
  "speaker_identity_guessed",
  "system_event",
] as const satisfies readonly IncomingMessageType[];

export type MeetingStreamEventType =
  (typeof MEETING_STREAM_EVENT_TYPES)[number];

export type MeetingStreamHandlers = Record<
  MeetingStreamEventType,
  IncomingMessageHandler
>;

export function subscribeToMeetingEvents(
  client: Pick<AudioStreamingClient, "subscribe">,
  handlers: MeetingStreamHandlers
): () => void {
  const unsubscribe = MEETING_STREAM_EVENT_TYPES.map((type) =>
    client.subscribe(type, handlers[type])
  );

  return () => {
    for (const dispose of unsubscribe) {
      dispose();
    }
  };
}
