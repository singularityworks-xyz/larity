/**
 * realtime-socket.ts — WebSocket Manager for Desktop App
 */

import { createLogger } from "../lib/logger";

export type VadSignalType = "vad_speaking" | "vad_silence";

export interface VadSignal {
  sessionId: string;
  ts: number;
  type: VadSignalType;
  userId: string;
}

export class RealtimeSocket {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly sessionId: string;
  private readonly userId: string;
  private readonly log = createLogger("realtime-socket");

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
      this.log.info("Connected to realtime plane.");
    };

    this.ws.onclose = () => {
      this.log.info("Disconnected.");
      this.ws = null;
    };

    this.ws.onerror = (err) => {
      this.log.error("Error:", err);
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
      this.log.warn("Cannot send VAD signal, socket not open.");
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
      this.log.error("Failed to send VAD signal:", err);
    }
  }
}
