/**
 * session-manager.ts — Session Manager
 *
 * Manages the mapping between session IDs and Deepgram connections.
 * Enforces connection limits and provides session lifecycle methods.
 */

import { createDualChannelSession } from "./dual-channel-session";
import { MAX_CONNECTIONS } from "./env";
import { createSttLogger } from "./logger";

const log = createSttLogger("session-manager");

interface SessionConnection {
  sendAudio(audioBuffer: Buffer): Promise<void>;
  close(): void;
}

type ConnectionFactory = (sessionId: string) => SessionConnection;

/**
 * SessionManager maintains active Deepgram connections.
 *
 * Responsibilities:
 * - Create/close Deepgram connections per session
 * - Route audio to the correct connection
 * - Enforce max concurrent connections limit
 */
export class SessionManager {
  private readonly connections: Map<string, SessionConnection> = new Map();
  private readonly createConnection: ConnectionFactory;

  constructor(createConnection?: ConnectionFactory) {
    this.createConnection =
      createConnection ??
      ((sessionId: string) => createDualChannelSession(sessionId));
  }

  /**
   * Create a new Deepgram connection for a session
   */
  createSession(sessionId: string): boolean {
    // Check if session already exists
    if (this.connections.has(sessionId)) {
      log.info(`Session ${sessionId} already exists`);
      return true;
    }

    // Enforce connection limit
    if (this.connections.size >= MAX_CONNECTIONS) {
      log.error(
        `Max connections (${MAX_CONNECTIONS}) reached, rejecting ${sessionId}`
      );
      return false;
    }

    // Create connection (will connect lazily on first audio)
    const connection = this.createConnection(sessionId);
    this.connections.set(sessionId, connection);

    log.info(
      `Session ${sessionId} ready (${this.connections.size}/${MAX_CONNECTIONS})`
    );

    return true;
  }

  /**
   * Close and remove a session
   */
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

  /**
   * Send audio to a session.
   *
   * Buffer layout: `[tag: u8][pcm mono linear16 LE]`.
   * See `@larity/stt/dual-channel-session` for tag constants.
   */
  async sendAudio(sessionId: string, audioBuffer: Buffer): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      // Silently drop - session may have ended
      return;
    }

    await connection.sendAudio(audioBuffer);
  }

  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  /**
   * Get current session count
   */
  get sessionCount(): number {
    return this.connections.size;
  }

  /**
   * Close all sessions (for graceful shutdown)
   */
  closeAll(): void {
    log.info(`Closing all ${this.connections.size} sessions...`);

    const sessionIds = Array.from(this.connections.keys());
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId);
    }

    log.info("All sessions closed");
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
