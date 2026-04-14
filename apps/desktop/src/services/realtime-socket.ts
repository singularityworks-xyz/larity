/**
 * realtime-socket.ts — WebSocket Manager for Desktop App
 */

export type VadSignalType = "vad_speaking" | "vad_silence";

export interface VadSignal {
  type: VadSignalType;
  userId: string;
  sessionId: string;
  ts: number;
}

export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly sessionId: string;
  private readonly userId: string;

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
    // Resolve URL from env or fallback to local
    const baseWsUrl = import.meta.env?.VITE_WS_URL || "ws://127.0.0.1:9001";
    this.url = `${baseWsUrl}/?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}&role=host`;
  }

  connect(): void {
    if (this.ws) {
      return;
    }
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[RealtimeSocket] Connected to realtime plane.");
    };

    this.ws.onclose = () => {
      console.log("[RealtimeSocket] Disconnected.");
      this.ws = null;
    };

    this.ws.onerror = (err) => {
      console.error("[RealtimeSocket] Error:", err);
    };
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendVadSignal(type: VadSignalType): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn("[RealtimeSocket] Cannot send VAD signal, socket not open.");
      return;
    }

    const payload: VadSignal = {
      type,
      userId: this.userId,
      sessionId: this.sessionId,
      ts: Date.now(),
    };

    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error("[RealtimeSocket] Failed to send VAD signal:", err);
    }
  }
}
