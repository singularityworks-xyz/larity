import { describe, expect, it } from "bun:test";
import { AudioStreamingClient, shouldDropFrame } from "./audio-streaming";

describe("audio streaming backpressure", () => {
  it("drops oldest frame when websocket buffer is over threshold", () => {
    const client = new AudioStreamingClient({
      backpressureThresholdBytes: 100,
      maxPendingFrames: 2,
    });

    const socketLike = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 101,
      send: () => {
        throw new Error("send should not be called when frame drops");
      },
    } as unknown as WebSocket;

    Reflect.set(client, "socket", socketLike);

    client.handleAudioFrame({
      payload: {
        ts: Date.now(),
        sessionId: "session-a",
        data: "AQID",
      },
    });

    client.handleAudioFrame({
      payload: {
        ts: Date.now(),
        sessionId: "session-a",
        data: "AQID",
      },
    });

    const result = client.handleAudioFrame({
      payload: {
        ts: Date.now(),
        sessionId: "session-a",
        data: "AQID",
      },
    });

    expect(result).toEqual({ sent: false, dropped: true });
    expect(client.getMetrics().framesDropped).toBe(3);
    expect(client.getWarning()).toContain(
      "dropping oldest realtime audio frames"
    );
  });

  it("flushes pending queue when buffer is below threshold", () => {
    let sentPayload: unknown;
    const client = new AudioStreamingClient({
      backpressureThresholdBytes: 100,
      maxPendingFrames: 4,
    });

    const socketLike = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 20,
      send: (payload: unknown) => {
        sentPayload = payload;
      },
    } as unknown as WebSocket;

    Reflect.set(client, "socket", socketLike);

    const result = client.handleAudioFrame({
      payload: {
        ts: Date.now(),
        sessionId: "session-a",
        data: "AQID",
      },
    });

    expect(result).toEqual({ sent: true, dropped: false });
    expect(client.getMetrics().framesSent).toBe(1);
    expect(sentPayload).toBeInstanceOf(Uint8Array);
  });

  it("evaluates backpressure threshold correctly", () => {
    expect(shouldDropFrame(65_536, 65_535)).toBe(true);
    expect(shouldDropFrame(65_535, 65_535)).toBe(false);
    expect(shouldDropFrame(0, 65_535)).toBe(false);
  });
});
