/**
 * session-manager.ts — Session Manager
 *
 * Manages the mapping between session IDs and Deepgram connections.
 * Enforces connection limits and provides session lifecycle methods.
 */

import { DeepgramConnection } from "./deepgram/connection";
import { MAX_CONNECTIONS } from "./env";
import type { AudioSource } from "./types";

/**
 * SessionManager maintains active Deepgram connections.
 *
 * Responsibilities:
 * - Create/close Deepgram connections per session
 * - Route audio to the correct connection
 * - Enforce max concurrent connections limit
 */
class SessionManager {
  private readonly connections: Map<string, DeepgramConnection> = new Map();

  /**
   * Create a new Deepgram connection for a session
   */
  createSession(sessionId: string): boolean {
    // Check if session already exists
    if (this.connections.has(sessionId)) {
      console.log(`[SessionManager] Session ${sessionId} already exists`);
      return true;
    }

    // Enforce connection limit
    if (this.connections.size >= MAX_CONNECTIONS) {
      console.error(
        `[SessionManager] Max connections (${MAX_CONNECTIONS}) reached, rejecting ${sessionId}`
      );
      return false;
    }

    // Create connection (will connect lazily on first audio)
    const connection = new DeepgramConnection(sessionId);
    this.connections.set(sessionId, connection);

    console.log(
      `[SessionManager] Session ${sessionId} ready (${this.connections.size}/${MAX_CONNECTIONS})`
    );

    return true;
  }

  /**
   * Close and remove a session
   */
  async closeSession(sessionId: string): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      console.log(`[SessionManager] Session ${sessionId} not found for close`);
      return;
    }

    await connection.close();
    this.connections.delete(sessionId);

    console.log(
      `[SessionManager] Closed session ${sessionId} (${this.connections.size}/${MAX_CONNECTIONS})`
    );
  }

  /**
   * Send audio to a session's Deepgram connection
   */
  async sendAudio(
    sessionId: string,
    audioBuffer: Buffer,
    source: AudioSource
  ): Promise<void> {
    const connection = this.connections.get(sessionId);
    if (!connection) {
      // Silently drop - session may have ended
      return;
    }

    await connection.sendAudio(audioBuffer, source);
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
  async closeAll(): Promise<void> {
    console.log(
      `[SessionManager] Closing all ${this.connections.size} sessions...`
    );

    const closePromises = Array.from(this.connections.keys()).map((sessionId) =>
      this.closeSession(sessionId)
    );

    await Promise.all(closePromises);
    console.log("[SessionManager] All sessions closed");
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
