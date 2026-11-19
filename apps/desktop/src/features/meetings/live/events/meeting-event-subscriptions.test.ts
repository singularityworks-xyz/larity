import { expect, test } from "bun:test";
import type { IncomingMessageHandler } from "../capture/audio-streaming";
import {
  MEETING_STREAM_EVENT_TYPES,
  subscribeToMeetingEvents,
} from "./meeting-event-subscriptions";

test("meeting event cleanup unsubscribes every registered handler", () => {
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];
  const client = {
    subscribe(type: string, _handler: IncomingMessageHandler) {
      subscribed.push(type);
      return () => unsubscribed.push(type);
    },
  };
  const noOp: IncomingMessageHandler = () => undefined;
  const handlers = {
    alert: noOp,
    ledger: noOp,
    meeting_processed: noOp,
    participant_event: noOp,
    speaker_identity_guessed: noOp,
    stt_final: noOp,
    stt_partial: noOp,
    system_event: noOp,
    topic: noOp,
    utterance: noOp,
  };

  const cleanup = subscribeToMeetingEvents(client, handlers);
  cleanup();

  expect(subscribed).toEqual([...MEETING_STREAM_EVENT_TYPES]);
  expect(unsubscribed).toEqual([...MEETING_STREAM_EVENT_TYPES]);
});
