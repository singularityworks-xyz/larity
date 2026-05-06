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
  role: "host" | "participant"
): string {
  const url = new URL(wsBaseUrl);
  url.searchParams.set("sessionId", sessionId);
  url.searchParams.set("userId", userId);
  url.searchParams.set("role", role);
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
  private role: "host" | "participant";
  private readonly backpressureThresholdBytes: number;
  private readonly maxPendingFrames: number;
  private readonly pendingFrames: Uint8Array[] = [];
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
        this.role
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

  setIdentity(userId: string, role: "host" | "participant" = "host"): void {
    this.userId = sanitizeUserId(userId);
    this.role = role;
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

    if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      this.metrics.framesDropped += 1;
      this.warning =
        "Realtime socket is not connected. Frames are being dropped.";
      return { sent: false, dropped: true };
    }

    const frameBytes = ensureTaggedAudioFrame(
      decodeBase64ToBytes(payload.data)
    );
    this.pendingFrames.push(frameBytes);

    let dropped = false;

    if (
      this.socket.readyState === WebSocket.OPEN &&
      shouldDropFrame(
        this.socket.bufferedAmount,
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
      if (this.socket.readyState === WebSocket.OPEN) {
        this.warning =
          "Network heartbeat warning: upload is congested; dropping oldest realtime audio frames.";
      }
    }

    let sent = false;
    if (this.socket.readyState === WebSocket.OPEN) {
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
        this.socket.send(nextFrame);
        this.metrics.framesSent += 1;
        sent = true;
      }
    }

    if (
      !dropped &&
      this.socket.readyState === WebSocket.OPEN &&
      this.pendingFrames.length > 0 &&
      shouldDropFrame(
        this.socket.bufferedAmount,
        this.backpressureThresholdBytes
      )
    ) {
      this.warning =
        "Network heartbeat warning: upload is congested; dropping oldest realtime audio frames.";
    }

    if (sent && this.warning !== "") {
      this.warning = "";
    }

    return { sent, dropped };
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
  if (typeof data.alertType === "string" || typeof data.level === "string") {
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
