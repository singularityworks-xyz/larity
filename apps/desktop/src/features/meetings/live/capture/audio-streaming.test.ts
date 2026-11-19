import { afterEach, describe, expect, test } from "bun:test";
import { AudioStreamingClient, parseRawAudioFrame } from "./audio-streaming";

type MessageListener = (event: { data: unknown }) => void;

class FakeSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: MessageListener | null = null;
  onopen: (() => void) | null = null;
  readonly readyState = FakeSocket.OPEN;
  readonly sent: unknown[] = [];
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  close(): void {
    // noop — fake socket needs no teardown
  }
  send(data: unknown): void {
    this.sent.push(data);
  }
}

const sockets: FakeSocket[] = [];
const RealWebSocket = globalThis.WebSocket;

function installFakeSocket(): void {
  sockets.length = 0;
  globalThis.WebSocket = class extends FakeSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
  } as unknown as typeof WebSocket;
}

afterEach(() => {
  globalThis.WebSocket = RealWebSocket;
});

describe("AudioStreamingClient", () => {
  test("dispatches stt_partial and stamps ws receive time", async () => {
    installFakeSocket();
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    client.connect("test-session-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.getLastWsRecvPerf()).toBe(0);

    const received: unknown[] = [];
    client.subscribe("stt_partial", (data) => {
      received.push(data);
    });

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ transcript: "hello", type: "stt_partial" }),
    });

    expect(received.length).toBe(1);
    expect(client.getLastWsRecvPerf()).toBeGreaterThan(0);
    client.disconnect();
  });

  test("switching sessions closes the old socket and rejects stale frames", async () => {
    installFakeSocket();
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    client.connect("session-a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sockets.length).toBe(1);

    // A frame tagged for another session (stale Tauri Channel) is ignored.
    const stale = client.handleRawAudioFrame(
      requireFrame(buildRawFrame(0, 1_000_000n, [1, 2, 3])),
      "session-b"
    );
    expect(stale).toEqual({ sent: false, dropped: false });

    // Connecting a different session replaces the socket.
    client.connect("session-b");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sockets.length).toBe(2);
    client.disconnect();
  });
});

function requireFrame(buffer: ArrayBuffer) {
  const frame = parseRawAudioFrame(buffer);
  if (!frame) {
    throw new Error("test fixture produced an unparsable frame");
  }
  return frame;
}

function buildRawFrame(
  tag: number,
  ts: bigint,
  samples: number[]
): ArrayBuffer {
  const buffer = new ArrayBuffer(9 + samples.length * 2);
  const view = new DataView(buffer);
  view.setUint8(0, tag);
  view.setBigUint64(1, ts, true);
  samples.forEach((sample, i) => {
    view.setInt16(9 + i * 2, sample, true);
  });
  return buffer;
}

describe("parseRawAudioFrame", () => {
  test("parses tag, ts, and sample view", () => {
    const frame = parseRawAudioFrame(
      buildRawFrame(1, 123456789n, [0, 1000, -1000])
    );
    expect(frame?.tag).toBe(1);
    expect(frame?.ts).toBe(123_456_789);
    expect(frame?.samples.length).toBe(6);
    const view = new DataView(
      frame?.samples.buffer ?? new ArrayBuffer(0),
      frame?.samples.byteOffset ?? 0,
      6
    );
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(1000);
    expect(view.getInt16(4, true)).toBe(-1000);
  });

  test("rejects truncated buffers and unknown tags", () => {
    expect(parseRawAudioFrame(new ArrayBuffer(8))).toBeNull();
    expect(parseRawAudioFrame(buildRawFrame(7, 1n, [0]))).toBeNull();
  });
});

describe("handleRawAudioFrame", () => {
  test("sends tagged bytes with no sessionId and no base64", async () => {
    installFakeSocket();
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    client.connect("test-session-1");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const buffer = buildRawFrame(0, 42n, [16, -16]);
    const result = client.handleRawAudioFrame(
      requireFrame(buffer),
      "test-session-1"
    );

    expect(result).toEqual({ dropped: false, sent: true });
    const sent = sockets[0]?.sent;
    expect(sent?.length).toBe(2); // audio_stream_start + frame
    const frameBytes = sent?.[1] as Uint8Array;
    expect(frameBytes[0]).toBe(0);
    expect(frameBytes.length).toBe(5);
    const metrics = client.getMetrics();
    expect(metrics.framesSent).toBe(1);
    expect(metrics.lastFrameTs).toBe(42);
    client.disconnect();
  });

  test("drops frames when the socket is unavailable", () => {
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    const result = client.handleRawAudioFrame(
      requireFrame(buildRawFrame(1, 7n, [1])),
      "s"
    );
    expect(result).toEqual({ dropped: true, sent: false });
    expect(client.getMetrics().framesDropped).toBe(1);
  });
});

class ManualSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  onclose: ((event: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  readyState = ManualSocket.CONNECTING;
  readonly sent: unknown[] = [];
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    manualSockets.push(this);
  }

  close(): void {
    // noop
  }

  send(data: unknown): void {
    this.sent.push(data);
  }

  open(): void {
    this.readyState = ManualSocket.OPEN;
    this.onopen?.();
  }
}

const manualSockets: ManualSocket[] = [];

function installManualSocket(): void {
  manualSockets.length = 0;
  globalThis.WebSocket = ManualSocket as unknown as typeof WebSocket;
}

describe("flush on open and timer (P4.9)", () => {
  test("frames queued while connecting flush on open", () => {
    installManualSocket();
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    client.connect("s");
    const sock = manualSockets[0];
    expect(sock?.readyState).toBe(ManualSocket.CONNECTING);

    client.handleRawAudioFrame(requireFrame(buildRawFrame(0, 1n, [5])), "s");
    expect(sock?.sent.length).toBe(0);
    expect(client.getMetrics().framesSent).toBe(0);

    sock?.open();
    expect(sock?.sent.length).toBe(2); // audio_stream_start + frame
    expect(client.getMetrics().framesSent).toBe(1);
    client.disconnect();
  });

  test("50ms pump drains the queue when the socket opens silently", async () => {
    installManualSocket();
    const client = new AudioStreamingClient({
      role: "host",
      userId: "u1",
      wsBaseUrl: "ws://127.0.0.1:9001",
    });
    client.connect("s");
    const sock = manualSockets[0];

    client.handleRawAudioFrame(requireFrame(buildRawFrame(1, 2n, [6])), "s");
    expect(sock?.sent.length).toBe(0);

    // Socket opens without firing onopen (missed event): the pump still
    // drains within a few intervals.
    if (sock) {
      sock.readyState = ManualSocket.OPEN;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sock?.sent.length).toBe(2);
    expect(client.getMetrics().framesSent).toBe(1);
    client.disconnect();
  });
});
