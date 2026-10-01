import { WS_URL } from "../lib/env";
import { createLogger } from "../lib/logger";

export interface AudioStatusSnapshot {
  active: boolean;
  backend: string;
  error?: string | null;
  /** Mixer frames shed by the bounded drop-oldest queue (P4.3). */
  mixer_drops?: number;
}

/**
 * Raw audio frame as delivered by the Rust mixer over a Tauri `Channel`
 * (P4.1): `[tag: u8][ts: u64 LE][linear16 LE samples…]`, arriving in JS as
 * an `ArrayBuffer`. No base64, no `atob`, no per-frame JSON envelope — and
 * no `sessionId` per frame (the client already knows it).
 */
export interface RawAudioFrame {
  samples: Uint8Array;
  tag: number;
  ts: number;
}

export interface AudioStreamingMetrics {
  framesDropped: number;
  framesSent: number;
  lastFrameTs: number;
}

export interface AudioStreamingOptions {
  backpressureThresholdBytes?: number;
  maxPendingFrames?: number;
  role?: "host" | "participant";
  userId?: string;
  userName?: string;
  wsBaseUrl?: string;
}

export type IncomingMessageType =
  | "utterance"
  | "topic"
  | "ledger"
  | "alert"
  | "participant_event"
  | "stt_partial"
  | "stt_final"
  | "meeting_processed"
  | "speaker_identity_guessed"
  | "system_event"
  | "unknown";

export type IncomingMessageHandler = (data: Record<string, unknown>) => void;

interface SendResult {
  dropped: boolean;
  sent: boolean;
}

const DEFAULT_WS_URL = WS_URL;
const DEFAULT_USER_ID = "desktop-host";
const DEFAULT_BACKPRESSURE_THRESHOLD = 64 * 1024;
const DEFAULT_MAX_PENDING_FRAMES = 8;
const WS_AUDIO_TAG_MIC = 0;
const WS_AUDIO_TAG_SYS = 1;
const LEGACY_AUDIO_FRAME_TAG = WS_AUDIO_TAG_SYS;
const DEBUG_INGEST_ENDPOINT =
  "http://127.0.0.1:7268/ingest/d02c4985-7539-46d4-bc45-33f990c9f9a8";

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

/**
 * Parse one mixer frame. Returns `null` for truncated buffers or unknown
 * tags so a corrupt frame can never poison the upload queue.
 */
export function parseRawAudioFrame(buffer: ArrayBuffer): RawAudioFrame | null {
  if (buffer.byteLength < 9) {
    return null;
  }
  const view = new DataView(buffer);
  const tag = view.getUint8(0);
  if (tag !== WS_AUDIO_TAG_MIC && tag !== WS_AUDIO_TAG_SYS) {
    return null;
  }
  const ts = Number(view.getBigUint64(1, true));
  return { samples: new Uint8Array(buffer, 9), tag, ts };
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

function sendAlertClassificationDebugLog(
  data: Record<string, unknown>,
  resolvedType: IncomingMessageType
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  const cat = data.category;
  const sev = data.severity;
  const looksLikeAlert =
    (typeof cat === "string" && typeof sev === "string") ||
    typeof data.alertType === "string" ||
    typeof data.level === "string";
  if (!looksLikeAlert) {
    return;
  }
  const isDebugEnv =
    typeof process === "undefined"
      ? import.meta.env?.VITE_ENABLE_ALERT_CLASSIFICATION_DEBUG
      : process.env.ENABLE_ALERT_CLASSIFICATION_DEBUG;
  const enabled = isDebugEnv === "true" || isDebugEnv === "1";
  if (!enabled) {
    return;
  }
  // #region agent log
  fetch(DEBUG_INGEST_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "6eb14a",
    },
    body: JSON.stringify({
      sessionId: "6eb14a",
      runId: "post-fix",
      hypothesisId: "A",
      location: "audio-streaming.ts:onmessage",
      message: "WS frame classified for alert-shaped payload",
      data: {
        resolvedType,
        hasUtteranceId: typeof data.utteranceId === "string",
        hasTopicId: typeof data.topicId === "string",
        topicIdValue:
          typeof data.topicId === "string"
            ? (data.topicId as string).slice(0, 64)
            : null,
        hasCategory: typeof cat === "string",
        hasSeverity: typeof sev === "string",
        hasId: typeof data.id === "string",
        triggerTier: data.triggerTier,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => undefined);
  // #endregion
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

  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private currentSessionId: string | null = null;
  private isExplicitlyDisconnected = false;
  private readonly maxReconnectAttempts = 10;
  private readonly baseReconnectDelayMs = 1000;
  private readonly maxReconnectDelayMs = 30_000;
  /**
   * 50 ms flush pump (P4.9). Runs only while frames are queued but the
   * socket isn't draining them, so queued audio doesn't wait for the next
   * incoming frame. Stopped as soon as the queue drains.
   */
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly FLUSH_INTERVAL_MS = 50;

  private readonly metrics: AudioStreamingMetrics = {
    framesSent: 0,
    framesDropped: 0,
    lastFrameTs: 0,
  };

  /**
   * `performance.now()` captured at the top of the last WS text-message
   * dispatch. Lets subscribers measure ws_recv → setState latency
   * synchronously during dispatch (Phase 0 observability, dev only).
   */
  private lastWsRecvPerf = 0;

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
    const previousSessionId = this.currentSessionId;
    const socketLive =
      this.socket?.readyState === WebSocket.OPEN ||
      this.socket?.readyState === WebSocket.CONNECTING;

    // A different session must never inherit the previous socket (P4.1):
    // close it without triggering reconnect and drop its queued frames so
    // audio from meeting A cannot be attributed to meeting B.
    if (socketLive && previousSessionId && previousSessionId !== sessionId) {
      this.isExplicitlyDisconnected = true;
      const oldSocket = this.socket;
      this.socket = null;
      try {
        oldSocket?.close(1000, "session changed");
      } catch {
        // Already closed.
      }
      this.pendingFrames.length = 0;
      this.streamStarted = false;
    }

    this.currentSessionId = sessionId;
    this.isExplicitlyDisconnected = false;
    this.clearReconnectTimer();
    this.clearFlushTimer();

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
        this.reconnectAttempts = 0; // Reset reconnection attempts on successful connect
        // P4.9: drain anything queued while connecting (sends stream start).
        if (this.currentSessionId) {
          this.flushPending(this.currentSessionId);
          this.ensureFlushTimer();
        }
      }
    };

    ws.onclose = (event) => {
      this.log.info(`WebSocket closed (code: ${event.code})`);
      if (this.socket !== ws) {
        this.log.info("Ignoring close event from stale socket");
        return;
      }

      if (event.code !== 1000 && !this.isExplicitlyDisconnected) {
        this.warning =
          "Realtime socket closed unexpectedly. Attempting to reconnect...";
        this.socket = null;
        this.scheduleReconnect();
      } else {
        this.socket = null;
      }
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

      this.lastWsRecvPerf = performance.now();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = detectIncomingMessageType(data);
      sendAlertClassificationDebugLog(data, type);
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

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyDisconnected || !this.currentSessionId) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log.error("Max reconnection attempts reached. Giving up.");
      this.warning = "Connection lost. Please refresh the page or try again.";
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelayMs * 2 ** this.reconnectAttempts +
        Math.random() * 1000,
      this.maxReconnectDelayMs
    );

    this.log.info(
      `Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );

    this.clearReconnectTimer();
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectAttempts++;
      if (this.currentSessionId && !this.isExplicitlyDisconnected) {
        this.connect(this.currentSessionId);
      }
    }, delay);
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
    this.isExplicitlyDisconnected = true;
    this.currentSessionId = null;
    this.clearReconnectTimer();
    this.clearFlushTimer();
    this.pendingFrames.length = 0;

    if (this.socket) {
      this.log.info("Disconnecting WebSocket");
      this.socket.close(1000, "Client disconnected");
      this.socket = null;
    }
    this.streamStarted = false;
  }

  getMetrics(): AudioStreamingMetrics {
    return { ...this.metrics };
  }

  /** See `lastWsRecvPerf`. Returns 0 if no text message received yet. */
  getLastWsRecvPerf(): number {
    return this.lastWsRecvPerf;
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

  /**
   * Upload path for Channel-delivered frames (P4.1). The tag prefix is
   * guaranteed by the Rust mixer; `ensureTaggedAudioFrame` stays as a
   * cheap defensive check.
   */
  handleRawAudioFrame(frame: RawAudioFrame, sessionId: string): SendResult {
    // Frames from a stale Tauri Channel (previous meeting) must never reach
    // the current session's socket. Before any connect, there is no current
    // session and the normal unavailable-socket path applies.
    if (this.currentSessionId !== null && sessionId !== this.currentSessionId) {
      return { sent: false, dropped: false };
    }
    this.metrics.lastFrameTs = frame.ts;

    if (!this.isSocketAvailable()) {
      this.metrics.framesDropped += 1;
      this.warning =
        "Realtime socket is not connected. Frames are being dropped.";
      return { sent: false, dropped: true };
    }

    // Rebuild the tagged wire frame: [tag][samples…].
    const tagged = new Uint8Array(frame.samples.length + 1);
    tagged[0] = frame.tag;
    tagged.set(frame.samples, 1);
    const frameBytes = ensureTaggedAudioFrame(tagged);
    this.pendingFrames.push({ data: frameBytes, ts: frame.ts });

    const dropped = this.manageBackpressure();
    const sent = this.flushPending(sessionId);
    this.ensureFlushTimer();

    this.updateWarning(sent, dropped);

    return { sent, dropped };
  }

  /**
   * Start the 50 ms flush pump when frames are waiting (P4.9). No-op when
   * the queue is empty or the pump already runs. The pump stops itself on
   * drain; `connect`/`disconnect` stop it unconditionally. Uses global
   * timers (not `window.*`) so the client stays testable outside a browser.
   */
  private ensureFlushTimer(): void {
    if (this.flushTimer !== null || this.pendingFrames.length === 0) {
      return;
    }
    this.flushTimer = setInterval(() => {
      if (this.currentSessionId) {
        this.flushPending(this.currentSessionId);
      }
      if (this.pendingFrames.length === 0) {
        this.clearFlushTimer();
      }
    }, AudioStreamingClient.FLUSH_INTERVAL_MS);
  }

  private clearFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
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

  changeParticipantRole(
    sessionId: string,
    speakerId: string,
    role: "TEAM" | "EXTERNAL"
  ): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: "participant_role_change",
        sessionId,
        speakerId,
        role,
        clientSendTs: Date.now(),
      })
    );
  }
}

function detectIncomingMessageType(
  data: Record<string, unknown>
): IncomingMessageType {
  const dataType = data.type;
  if (dataType === "SPEAKER_IDENTITY_GUESSED") {
    return "speaker_identity_guessed";
  }
  if (dataType === "stt_partial") {
    return "stt_partial";
  }
  if (dataType === "stt_final") {
    return "stt_final";
  }
  if (dataType === "system_event") {
    return "system_event";
  }
  if (dataType === "meeting_processed") {
    return "meeting_processed";
  }
  if (dataType === "alert") {
    return "alert";
  }
  if (
    typeof dataType === "string" &&
    (dataType === "insert" || dataType === "status_change")
  ) {
    return "ledger";
  }
  // Topic deltas patch an already-rendered utterance; they carry utteranceId
  // too, so they must classify as "topic" before the generic utterance branch.
  if (dataType === "utterance_topic") {
    return "topic";
  }
  if (typeof data.utteranceId === "string") {
    return "utterance";
  }
  // Alerts include `topicId` (context); classify before generic topicId branch.
  if (
    typeof data.alertType === "string" ||
    typeof data.level === "string" ||
    (typeof data.category === "string" && typeof data.severity === "string")
  ) {
    return "alert";
  }
  if (typeof data.topicId === "string") {
    return "topic";
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
