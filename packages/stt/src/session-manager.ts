import { createDualChannelSession } from "./deepgram/streaming/dual-channel-session";
import { MAX_CONNECTIONS } from "./env";
import { createSttLogger } from "./logger";

const log = createSttLogger("session-manager");

interface SessionConnection {
  close(): void;
  preconnect?(): void;
  sendAudio(audioBuffer: Buffer): void;
  setAudioStreamStart(serverAudioStartTs: number): void;
}

type ConnectionFactory = (sessionId: string) => SessionConnection;

export class SessionManager {
  private readonly connections: Map<string, SessionConnection> = new Map();
  private readonly createConnection: ConnectionFactory;

  constructor(createConnection?: ConnectionFactory) {
    this.createConnection =
      createConnection ??
      ((sessionId: string) => createDualChannelSession(sessionId));
  }

  createSession(sessionId: string): boolean {
    if (this.connections.has(sessionId)) {
      log.info(`Session ${sessionId} already exists`);
      return true;
    }

    if (this.connections.size >= MAX_CONNECTIONS) {
      log.error(
        `Max connections (${MAX_CONNECTIONS}) reached, rejecting ${sessionId}`
      );
      return false;
    }

    const connection = this.createConnection(sessionId);
    this.connections.set(sessionId, connection);

    log.info(
      `Session ${sessionId} ready (${this.connections.size}/${MAX_CONNECTIONS})`
    );

    return true;
  }

  connectSession(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      return;
    }
    try {
      connection.preconnect?.();
    } catch (error) {
      log.error(
        error as Error,
        `Eager connect failed for ${sessionId} — lazy connect remains`
      );
    }
  }

  closeSession(sessionId: string): void {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      log.info(`Session ${sessionId} not found for close`);
      return;
    }

    connection.close();
    this.connections.delete(sessionId);

    log.info(
      `Closed session ${sessionId} (${this.connections.size}/${MAX_CONNECTIONS})`
    );
  }

  sendAudio(sessionId: string, audioBuffer: Buffer): void {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      return;
    }

    connection.sendAudio(audioBuffer);
  }

  setAudioStreamStart(sessionId: string, serverAudioStartTs: number): void {
    const connection = this.connections.get(sessionId);
    if (connection) {
      connection.setAudioStreamStart(serverAudioStartTs);
    }
  }

  hasSession(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  get sessionCount(): number {
    return this.connections.size;
  }

  closeAll(): void {
    log.info(`Closing all ${this.connections.size} sessions...`);

    const sessionIds = Array.from(this.connections.keys());
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId);
    }

    log.info("All sessions closed");
  }
}

export const sessionManager = new SessionManager();
