import { createMeetingModeLogger } from "../logger";
import { SpeakerIdentifier } from "./identifier";
import type { VadSignal } from "./types";

const log = createMeetingModeLogger("speaker-manager");

export class SpeakerManager {
  private readonly identifiers: Map<string, SpeakerIdentifier> = new Map();

  getIdentifier(sessionId: string): SpeakerIdentifier {
    let identifier = this.identifiers.get(sessionId);
    if (!identifier) {
      identifier = new SpeakerIdentifier(sessionId);
      this.identifiers.set(sessionId, identifier);
      log.info({ sessionId }, "Created new SpeakerIdentifier");
    }
    return identifier;
  }

  handleVadSignal(signal: VadSignal): void {
    const identifier = this.getIdentifier(signal.sessionId);
    identifier.processVadSignal(signal);
  }

  registerTeamMember(sessionId: string, userId: string, name: string): void {
    const identifier = this.getIdentifier(sessionId);
    identifier.registerTeamMember(userId, name);
    log.info(
      { sessionId, userId, name },
      "Registered team member in SpeakerIdentifier"
    );
  }

  removeSession(sessionId: string): void {
    if (this.identifiers.has(sessionId)) {
      this.identifiers.delete(sessionId);
      log.info({ sessionId }, "Removed SpeakerIdentifier");
    }
  }

  getAllIdentifiers(): Map<string, SpeakerIdentifier> {
    return new Map(this.identifiers);
  }
}
