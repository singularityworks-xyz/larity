import { describe, expect, it } from "bun:test";
import {
  AudioStreamingClient,
  buildRealtimeSocketUrl,
  ensureTaggedAudioFrame,
  shouldDropFrame,
} from "./audio-streaming";

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

  it("tags legacy raw PCM frames for the dual-channel STT session", () => {
    const taggedFrame = ensureTaggedAudioFrame(new Uint8Array([2, 3]));

    expect([...taggedFrame]).toEqual([1, 2, 3]);
  });

  it("does not double-tag frames that already carry an audio source tag", () => {
    const taggedFrame = ensureTaggedAudioFrame(new Uint8Array([1, 2, 3]));

    expect([...taggedFrame]).toEqual([1, 2, 3]);
  });

  it("builds realtime websocket URL with required query params", () => {
    const url = buildRealtimeSocketUrl(
      "ws://127.0.0.1:9001",
      "session-1",
      "user-1",
      "host"
    );
    expect(url).toContain("sessionId=session-1");
    expect(url).toContain("userId=user-1");
    expect(url).toContain("role=host");
  });

  it("builds realtime websocket URL with required query params", () => {
    const url = buildRealtimeSocketUrl(
      "ws://127.0.0.1:9001",
      "session-1",
      "user-1",
      "host"
    );
    expect(url).toContain("sessionId=session-1");
    expect(url).toContain("userId=user-1");
    expect(url).toContain("role=host");
  });

  it("includes name query param when userName is provided", () => {
    const url = buildRealtimeSocketUrl(
      "ws://127.0.0.1:9001",
      "session-1",
      "user-1",
      "host",
      "Alice"
    );
    expect(url).toContain("name=Alice");
  });

  it("omits name query param when userName is not provided", () => {
    const url = buildRealtimeSocketUrl(
      "ws://127.0.0.1:9001",
      "session-1",
      "user-1",
      "host"
    );
    expect(url).not.toContain("name=");
  });

  it("omits name query param when userName is empty", () => {
    const url = buildRealtimeSocketUrl(
      "ws://127.0.0.1:9001",
      "session-1",
      "user-1",
      "host",
      ""
    );
    expect(url).not.toContain("name=");
  });

  it("updates identity dynamically", () => {
    const client = new AudioStreamingClient({
      wsBaseUrl: "ws://127.0.0.1:9001",
      userId: "first-user",
      role: "host",
    });

    client.setIdentity("next-user", "participant");

    expect(Reflect.get(client, "userId")).toBe("next-user");
    expect(Reflect.get(client, "role")).toBe("participant");
  });

  it("stores userName from constructor options", () => {
    const client = new AudioStreamingClient({
      wsBaseUrl: "ws://127.0.0.1:9001",
      userId: "user-1",
      userName: "Alice",
      role: "host",
    });

    expect(Reflect.get(client, "userName")).toBe("Alice");
  });

  it("defaults userName to empty string when not provided", () => {
    const client = new AudioStreamingClient({
      wsBaseUrl: "ws://127.0.0.1:9001",
      userId: "user-1",
      role: "host",
    });

    expect(Reflect.get(client, "userName")).toBe("");
  });

  it("updates userName via setIdentity", () => {
    const client = new AudioStreamingClient({
      wsBaseUrl: "ws://127.0.0.1:9001",
      userId: "user-1",
      userName: "Alice",
      role: "host",
    });

    client.setIdentity("user-2", "participant", "Bob");

    expect(Reflect.get(client, "userName")).toBe("Bob");
  });

  it("does not change userName when setIdentity is called without userName", () => {
    const client = new AudioStreamingClient({
      wsBaseUrl: "ws://127.0.0.1:9001",
      userId: "user-1",
      userName: "Alice",
      role: "host",
    });

    client.setIdentity("user-2", "participant");

    expect(Reflect.get(client, "userName")).toBe("Alice");
  });
});
