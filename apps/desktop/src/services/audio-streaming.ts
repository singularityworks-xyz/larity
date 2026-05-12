import { createLogger } from "../lib/logger";

export interface AudioStatusSnapshot {
  active: boolean;
  backend: string;
  error?: string | null;
}

export interface AudioFramePayload {
  ts: number;
  sessionId: string;
  data: string;
}

export interface AudioFrameEvent {
  payload: AudioFramePayload;
}

export interface AudioStreamingMetrics {
  framesSent: number;
  framesDropped: number;
  lastFrameTs: number;
}

export interface AudioStreamingOptions {
  wsBaseUrl?: string;
  userId?: string;
  userName?: string;
  role?: "host" | "participant";
  backpressureThresholdBytes?: number;
  maxPendingFrames?: number;
}

export type IncomingMessageType =
  | "utterance"
  | "topic"
  | "ledger"
  | "alert"
  | "participant_event"
  | "stt_partial"
  | "stt_final"
  | "unknown";

export type IncomingMessageHandler = (data: Record<string, unknown>) => void;

interface SendResult {
  sent: boolean;
  dropped: boolean;
}

const DEFAULT_WS_URL = "ws://127.0.0.1:9001";
const DEFAULT_USER_ID = "desktop-host";
const DEFAULT_BACKPRESSURE_THRESHOLD = 64 * 1024;
const DEFAULT_MAX_PENDING_FRAMES = 8;
const WS_AUDIO_TAG_MIC = 0;
const WS_AUDIO_TAG_SYS = 1;
const LEGACY_AUDIO_FRAME_TAG = WS_AUDIO_TAG_SYS;

export function buildRealtimeSocketUrl(
  wsBaseUrl: string,
  sessionId: string,
  userId: string,
  role: "host" | "participant",
  userName?: string
): string {
  const url = new URL(wsBaseUrl);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("role", role);
  const normalizedName = userName?.trim();
  if (normalizedName) {
    url.searchParams.set("name", normalizedName);
  }
  return url.toString();
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function ensureTaggedAudioFrame(frameBytes: Uint8Array): Uint8Array {
  const maybeTag = frameBytes[0];
  const hasTag =
    frameBytes.length % 2 === 1 &&
    (maybeTag === WS_AUDIO_TAG_MIC || maybeTag === WS_AUDIO_TAG_SYS);

  if (hasTag) {
    return frameBytes;
  }

  const taggedFrame = new Uint8Array(frameBytes.length + 1);
  taggedFrame[0] = LEGACY_AUDIO_FRAME_TAG;
  taggedFrame.set(frameBytes, 1);
  return taggedFrame;
}

export function shouldDropFrame(
  bufferedAmount: number,
  thresholdBytes: number
): boolean {
  return bufferedAmount > thresholdBytes;
}

export class AudioStreamingClient {
  private socket: WebSocket | null = null;
  private readonly wsBaseUrl: string;
  private userId: string;
  private userName: string;
  private role: "host" | "participant";
  private readonly backpressureThresholdBytes: number;
  private readonly maxPendingFrames: number;
  private readonly pendingFrames: { data: Uint8Array; ts: number }[] = [];
  private streamStarted = false;
  private readonly log = createLogger("audio-streaming");
  private readonly messageHandlers = new Map<
    IncomingMessageType | "*",
    Set<IncomingMessageHandler>
  >();

  private readonly metrics: AudioStreamingMetrics = {
    framesSent: 0,
    framesDropped: 0,
    lastFrameTs: 0,
  };

  private warning = "";

  constructor(options: AudioStreamingOptions = {}) {
    this.wsBaseUrl = options.wsBaseUrl ?? DEFAULT_WS_URL;
    this.userId = sanitizeUserId(options.userId);
    this.userName = options.userName?.trim() ?? "";
    this.role = options.role ?? "host";
    this.backpressureThresholdBytes =
      options.backpressureThresholdBytes ?? DEFAULT_BACKPRESSURE_THRESHOLD;
    this.maxPendingFrames =
      options.maxPendingFrames ?? DEFAULT_MAX_PENDING_FRAMES;
  }

  connect(sessionId: string): void {
    if (
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING
    ) {
      this.log.info("Socket already open/connecting. Skipping connect.");
      return;
    }

    let url: string;
    try {
      url = buildRealtimeSocketUrl(
        this.wsBaseUrl,
        sessionId,
        this.userId,
        this.role,
        this.userName
      );
    } catch {
      this.warning =
        "Invalid websocket URL. Set a valid VITE_WS_URL like ws://127.0.0.1:9001.";
      return;
    }

    this.log.info("Connecting to", url.split("?")[0]);
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.log.info("WebSocket connected");
      if (this.socket === ws) {
        this.warning = "";
        this.streamStarted = false; // Reset stream state on new connection
      }
    };

    ws.onclose = (event) => {
      this.log.info(`WebSocket closed (code: ${event.code})`);
      if (this.socket !== ws) {
        this.log.info("Ignoring close event from stale socket");
        return;
      }

      if (event.code !== 1000) {
        this.warning =
          "Realtime socket closed unexpectedly. Check sessionId/userId authorization and realtime server logs.";
      }
      this.socket = null;
    };

    ws.onerror = () => {
      this.log.error("WebSocket error");
      if (this.socket !== ws) {
        return;
      }

      this.warning =
        "Realtime connection error. Audio may not be streaming to server.";
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== "string") {
        return;
      }

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = detectIncomingMessageType(data);
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        for (const handler of handlers) {
          handler(data);
        }
      }

      const allHandlers = this.messageHandlers.get("*");
      if (allHandlers) {
        for (const handler of allHandlers) {
          handler(data);
        }
      }
    };

    this.socket = ws;
  }

  setIdentity(
    userId: string,
    role: "host" | "participant" = "host",
    userName?: string
  ): void {
    this.userId = sanitizeUserId(userId);
    this.role = role;
    if (userName !== undefined) {
      this.userName = userName;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.log.info("Disconnecting socket manually");
      this.socket.close();
      this.socket = null;
    }
  }

  getMetrics(): AudioStreamingMetrics {
    return { ...this.metrics };
  }

  getWarning(): string {
    return this.warning;
  }

  clearWarning(): void {
    this.warning = "";
  }

  subscribe(
    type: IncomingMessageType | "*",
    handler: IncomingMessageHandler
  ): () => void {
    let handlers = this.messageHandlers.get(type);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(type, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  }

  handleAudioFrame(event: AudioFrameEvent): SendResult {
    const payload = event.payload;
    this.metrics.lastFrameTs = payload.ts;

    if (!this.isSocketAvailable()) {
      this.metrics.framesDropped += 1;
      this.warning =
        "Realtime socket is not connected. Frames are being dropped.";
      return { sent: false, dropped: true };
    }

    const frameBytes = ensureTaggedAudioFrame(
      decodeBase64ToBytes(payload.data)
    );
    this.pendingFrames.push({ data: frameBytes, ts: payload.ts });

    const dropped = this.manageBackpressure();
    const sent = this.flushPending(payload.sessionId);

    this.updateWarning(sent, dropped);

    return { sent, dropped };
  }

  private isSocketAvailable(): boolean {
    return (
      !!this.socket &&
      this.socket.readyState !== WebSocket.CLOSED &&
      this.socket.readyState !== WebSocket.CLOSING
    );
  }

  private manageBackpressure(): boolean {
    let dropped = false;
    const isSocketOpen = this.socket?.readyState === WebSocket.OPEN;

    if (
      isSocketOpen &&
      shouldDropFrame(
        this.socket?.bufferedAmount ?? 0,
        this.backpressureThresholdBytes
      )
    ) {
      this.pendingFrames.shift();
      this.metrics.framesDropped += 1;
      dropped = true;
      this.warning =
        "Network heartbeat warning: upload is congested; dropping oldest realtime audio frames.";
    }

    if (this.pendingFrames.length > this.maxPendingFrames) {
      this.pendingFrames.shift();
      this.metrics.framesDropped += 1;
      dropped = true;
      if (isSocketOpen) {
        this.warning =
          "Network heartbeat warning: upload is congested; dropping oldest realtime audio frames.";
      }
    }
    return dropped;
  }

  private flushPending(sessionId: string): boolean {
    let sent = false;
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return sent;
    }

    while (
      this.pendingFrames.length > 0 &&
      !shouldDropFrame(
        this.socket.bufferedAmount,
        this.backpressureThresholdBytes
      )
    ) {
      const nextFrame = this.pendingFrames.shift();
      if (!nextFrame) {
        break;
      }

      if (!this.streamStarted) {
        this.sendStreamStart(sessionId, nextFrame.ts);
      }

      this.socket.send(nextFrame.data as BufferSource);
      this.metrics.framesSent += 1;
      sent = true;
    }
    return sent;
  }

  private sendStreamStart(sessionId: string, clientTs: number): void {
    this.socket?.send(
      JSON.stringify({
        type: "audio_stream_start",
        sessionId,
        userId: this.userId,
        clientTs,
        clientSendTs: Date.now(),
      })
    );
    this.streamStarted = true;
  }

  private updateWarning(sent: boolean, dropped: boolean): void {
    if (sent && this.warning !== "") {
      this.warning = "";
      return;
    }

    if (
      !dropped &&
      this.socket?.readyState === WebSocket.OPEN &&
      this.pendingFrames.length > 0 &&
      shouldDropFrame(
        this.socket.bufferedAmount,
        this.backpressureThresholdBytes
      )
    ) {
      this.warning =
        "Network heartbeat warning: upload is congested; dropping oldest realtime audio frames.";
    }
  }

  sendVadSignal(type: "vad_speaking" | "vad_silence", sessionId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type,
        sessionId,
        userId: this.userId,
        clientSendTs: Date.now(),
      })
    );
  }
}

function detectIncomingMessageType(
  data: Record<string, unknown>
): IncomingMessageType {
  const dataType = data.type;
  if (dataType === "stt_partial") {
    return "stt_partial";
  }
  if (dataType === "stt_final") {
    return "stt_final";
  }
  if (
    typeof dataType === "string" &&
    (dataType === "insert" || dataType === "status_change")
  ) {
    return "ledger";
  }
  if (typeof data.utteranceId === "string") {
    return "utterance";
  }
  if (typeof data.topicId === "string") {
    return "topic";
  }
  if (
    typeof data.alertType === "string" ||
    typeof data.level === "string" ||
    (typeof data.category === "string" && typeof data.severity === "string")
  ) {
    return "alert";
  }
  if (
    dataType === "participant_joined" ||
    dataType === "participant_left" ||
    dataType === "participant_list"
  ) {
    return "participant_event";
  }
  return "unknown";
}

function sanitizeUserId(userId: string | undefined): string {
  const value = userId?.trim();
  return value ? value : DEFAULT_USER_ID;
}
