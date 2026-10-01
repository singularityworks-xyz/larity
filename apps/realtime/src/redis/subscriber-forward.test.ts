import { beforeEach, describe, expect, test } from "bun:test";
import { addConnection, __test_only_reset as resetSessions } from "../session";
import type { RealtimeSocket } from "../types";
import {
  __test_only_handleAlertChannel as handleAlertChannel,
  __test_only_handleBroadcastSessionChannel as handleBroadcastSessionChannel,
  __test_only_handleProcessedChannel as handleProcessedChannel,
  __test_only_handleSttChannel as handleSttChannel,
} from "./subscriber";

function makeSocket(userId = "u1"): RealtimeSocket & { sent: unknown[] } {
  const sent: unknown[] = [];
  const socket = {
    close: () => undefined,
    data: {
      connectedAt: Date.now(),
      lastFrameTs: Date.now(),
      name: "",
      orgId: "default",
      role: "host" as const,
      sessionId: "s1",
      userId,
    },
    send: (data: unknown) => {
      sent.push(data);
    },
    sent,
  };
  return socket;
}

function connectUser(sessionId = "s1", userId = "u1") {
  const socket = makeSocket(userId);
  addConnection(sessionId, {
    ...socket,
    data: { ...socket.data, sessionId, userId },
  } as RealtimeSocket);
  return socket;
}

describe("verbatim Redis forwarding (P5.1)", () => {
  beforeEach(() => {
    resetSessions();
  });

  test("new-shape STT forwards byte-identical (no re-stringify)", () => {
    const socket = connectUser();
    const message = JSON.stringify({
      channel: 1,
      confidence: 0.9,
      diarizationIndex: 1001,
      duration: 1,
      isFinal: false,
      sessionId: "s1",
      speechTimestamp: 1000,
      start: 0,
      transcript: "hello",
      ts: 1001,
      type: "stt_partial",
    });
    expect(handleSttChannel("meeting.stt.partial.s1", message)).toBe(true);
    expect(socket.sent).toEqual([message]);
  });

  test("legacy STT shape still gets its type injected", () => {
    const socket = connectUser();
    const handled = handleSttChannel(
      "meeting.stt.s1",
      JSON.stringify({ transcript: "hi" })
    );
    expect(handled).toBe(true);
    expect(socket.sent).toEqual([
      JSON.stringify({ transcript: "hi", type: "stt_final" }),
    ]);
  });

  test("processed events forward verbatim", () => {
    const socket = connectUser();
    const message = JSON.stringify({
      meetingId: "m1",
      sessionId: "s1",
      status: "complete",
      type: "meeting_processed",
    });
    expect(handleProcessedChannel("meeting.processed.s1", message)).toBe(true);
    expect(socket.sent).toEqual([message]);
  });

  test("alerts forward verbatim to shared channel", () => {
    const socket = connectUser();
    const message = JSON.stringify({ id: "a1", type: "alert" });
    handleAlertChannel("meeting.alert.s1.shared", message);
    expect(socket.sent).toEqual([message]);
  });

  test("alerts route verbatim to the personal channel", () => {
    const shared = connectUser("s1", "u1");
    const personal = connectUser("s1", "u2");
    const message = JSON.stringify({ id: "a2", type: "alert" });
    handleAlertChannel("meeting.alert.s1.user.u2", message);
    expect(personal.sent).toEqual([message]);
    expect(shared.sent).toEqual([]);
  });

  test("corrupt alert payloads still drop before broadcast", () => {
    const socket = connectUser();
    handleAlertChannel("meeting.alert.s1.shared", "{not json");
    expect(socket.sent).toEqual([]);
  });

  test("utterance/topic/ledger broadcast path is untouched", () => {
    const socket = connectUser();
    const message = JSON.stringify({ utteranceId: "u_1" });
    expect(handleBroadcastSessionChannel("meeting.utterance.s1", message)).toBe(
      true
    );
    expect(socket.sent).toEqual([message]);
  });
});
