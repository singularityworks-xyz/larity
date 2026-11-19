export interface SocketData {
  connectedAt: number;
  lastFrameTs: number;
  name: string;
  orgId: string;
  role: "host" | "participant";
  sessionId: string;
  userId: string;
}

export interface RealtimeSocket {
  close: () => void;
  data: SocketData;
  send: (
    data: string | Buffer | ArrayBuffer | Uint8Array | Record<string, unknown>
  ) => void;
}

export interface SessionConnection {
  connectedAt: number;
  role: "host" | "participant";
  socket: RealtimeSocket;
  userId: string;
}

export interface SessionEntry {
  connections: Map<string, SessionConnection>;
  lastFrameTs: number;
  startedAt: number;
}

export interface VadSignal {
  clientSendTs: number;
  role?: "host" | "participant";
  serverReceiveTs: number;
  sessionId: string;
  type: "vad_speaking" | "vad_silence";
  userId: string;
}

export interface ParticipantJoinEvent {
  name: string;
  role: "host" | "participant";
  sessionId: string;
  ts: number;
  userId: string;
}

export interface ParticipantLeaveEvent {
  sessionId: string;
  ts: number;
  userId: string;
}
