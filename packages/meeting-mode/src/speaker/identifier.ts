import { createMeetingModeLogger } from "../logger";
import type { SpeakerIdentity } from "../utterance/types";
import { createUnidentifiedSpeaker } from "../utterance/types";
import {
  DEFAULT_SPEAKER_CONFIG,
  type SpeakerIdentifierConfig,
  type SpeakerMapping,
  type VadSignal,
  type VadSpeakerState,
} from "./types";

const log = createMeetingModeLogger("speaker-identifier");

export class SpeakerIdentifier {
  private readonly sessionId: string;
  private readonly config: SpeakerIdentifierConfig;
  private readonly vadState: Map<string, VadSpeakerState> = new Map();
  private readonly identifiedSpeakers: Map<number, SpeakerMapping> = new Map();
  private readonly confirmationCounts: Map<string, Map<number, number>> =
    new Map();
  private readonly userIdToSpeakerId: Map<string, string> = new Map();
  private readonly teamMembers: Map<string, { userId: string; name: string }> =
    new Map();

  constructor(sessionId: string, config?: Partial<SpeakerIdentifierConfig>) {
    this.sessionId = sessionId;
    this.config = { ...DEFAULT_SPEAKER_CONFIG, ...config };
  }

  registerTeamMember(userId: string, name: string): void {
    this.teamMembers.set(userId, { userId, name });

    const counter = this.userIdToSpeakerId.size;
    if (!this.userIdToSpeakerId.has(userId)) {
      const speakerId = `spk_${counter}`;
      this.userIdToSpeakerId.set(userId, speakerId);
    }
  }

  hydrate(mappings: Map<number, SpeakerMapping>): void {
    for (const [index, mapping] of mappings) {
      this.identifiedSpeakers.set(index, mapping);
      if (mapping.speaker.type === "TEAM" && mapping.speaker.userId) {
        // Also register the late-hydrated user mapped backwards for internal linking
        this.teamMembers.set(mapping.speaker.userId, {
          userId: mapping.speaker.userId,
          name: mapping.speaker.name,
        });
        this.userIdToSpeakerId.set(
          mapping.speaker.userId,
          mapping.speaker.speakerId
        );

        // Also fast-forward confirmations to avoid overriding it natively later
        const counts = this.getConfirmationCounts(mapping.speaker.userId);
        counts.set(
          index,
          Math.max(counts.get(index) ?? 0, this.config.minConfirmationSignals)
        );
      }
    }
    log.info(
      { sessionId: this.sessionId, count: mappings.size },
      "Hydrated existing speaker mappings from persistence"
    );
  }

  processVadSignal(signal: VadSignal): void {
    const { userId, type, ts } = signal;

    const teamMember = this.teamMembers.get(userId);
    if (!teamMember) {
      return;
    }

    if (type === "vad_speaking") {
      this.vadState.set(userId, { isSpeaking: true, startTs: ts });
    } else {
      this.vadState.set(userId, { isSpeaking: false, startTs: ts });
    }
  }

  identifySpeaker(
    diarizationIndex: number,
    utteranceTimestamp: number
  ): SpeakerIdentity {
    const cached = this.identifiedSpeakers.get(diarizationIndex);
    if (cached) {
      return cached.speaker;
    }

    const correlatedUserId = this.correlate(
      diarizationIndex,
      utteranceTimestamp
    );

    if (correlatedUserId) {
      const teamMember = this.teamMembers.get(correlatedUserId);
      if (teamMember) {
        const speaker = this.createTeamIdentity(
          correlatedUserId,
          teamMember.name,
          diarizationIndex
        );
        this.identifiedSpeakers.set(diarizationIndex, {
          diarizationIndex,
          speaker,
          confirmedAt: Date.now(),
          confidence: 1,
        });

        log.info(
          { diarizationIndex, userId: correlatedUserId, name: teamMember.name },
          "Speaker identified as team member"
        );

        return speaker;
      }
    }

    return createUnidentifiedSpeaker(diarizationIndex);
  }

  private correlate(
    diarizationIndex: number,
    utteranceTimestamp: number
  ): string | undefined {
    const speakingMembers: string[] = [];

    for (const [userId, state] of this.vadState) {
      if (!state.isSpeaking) {
        continue;
      }

      const speakingDuration = utteranceTimestamp - state.startTs;
      if (speakingDuration < -this.config.correlationWindowMs) {
        continue;
      }

      if (
        speakingDuration >
        utteranceTimestamp - state.startTs + this.config.correlationWindowMs
      ) {
        continue;
      }

      speakingMembers.push(userId);
    }

    if (speakingMembers.length === 1) {
      const userId = speakingMembers[0] as string;

      const counts = this.getConfirmationCounts(userId);
      const currentCount = (counts.get(diarizationIndex) ?? 0) + 1;
      counts.set(diarizationIndex, currentCount);

      if (currentCount >= this.config.minConfirmationSignals) {
        return userId;
      }
    }

    if (speakingMembers.length > 1) {
      log.debug(
        { diarizationIndex, speakingMembers, count: speakingMembers.length },
        "Ambiguous correlation: multiple speakers active"
      );
    }

    return undefined;
  }

  tryLateIdentification(
    signal: VadSignal,
    pendingUtterances: Array<{ diarizationIndex: number; timestamp: number }>
  ): Array<{ diarizationIndex: number; speaker: SpeakerIdentity }> {
    const results: Array<{
      diarizationIndex: number;
      speaker: SpeakerIdentity;
    }> = [];

    this.processVadSignal(signal);

    for (const pending of pendingUtterances) {
      if (this.identifiedSpeakers.has(pending.diarizationIndex)) {
        continue;
      }

      const correlatedUserId = this.correlate(
        pending.diarizationIndex,
        pending.timestamp
      );

      if (correlatedUserId) {
        const teamMember = this.teamMembers.get(correlatedUserId);
        if (teamMember) {
          const speaker = this.createTeamIdentity(
            correlatedUserId,
            teamMember.name,
            pending.diarizationIndex
          );
          this.identifiedSpeakers.set(pending.diarizationIndex, {
            diarizationIndex: pending.diarizationIndex,
            speaker,
            confirmedAt: Date.now(),
            confidence: 0.9,
          });

          results.push({ diarizationIndex: pending.diarizationIndex, speaker });

          log.info(
            {
              diarizationIndex: pending.diarizationIndex,
              userId: correlatedUserId,
            },
            "Retroactive speaker identification"
          );
        }
      }
    }

    return results;
  }

  getSpeakerMapping(diarizationIndex: number): SpeakerMapping | undefined {
    return this.identifiedSpeakers.get(diarizationIndex);
  }

  getAllMappings(): Map<number, SpeakerMapping> {
    return new Map(this.identifiedSpeakers);
  }

  getVadState(): Map<string, VadSpeakerState> {
    return new Map(this.vadState);
  }

  isSpeaking(userId: string): boolean {
    return this.vadState.get(userId)?.isSpeaking ?? false;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getTeamMemberCount(): number {
    return this.teamMembers.size;
  }

  getIdentifiedCount(): number {
    return this.identifiedSpeakers.size;
  }

  getStats(): {
    teamMembers: number;
    identifiedSpeakers: number;
    activeVadSignals: number;
  } {
    let activeVad = 0;
    for (const state of this.vadState.values()) {
      if (state.isSpeaking) {
        activeVad++;
      }
    }

    return {
      teamMembers: this.teamMembers.size,
      identifiedSpeakers: this.identifiedSpeakers.size,
      activeVadSignals: activeVad,
    };
  }

  reset(): void {
    this.vadState.clear();
    this.identifiedSpeakers.clear();
    this.confirmationCounts.clear();
    log.info({ sessionId: this.sessionId }, "Speaker identifier reset");
  }

  private createTeamIdentity(
    userId: string,
    name: string,
    diarizationIndex: number
  ): SpeakerIdentity {
    const speakerId =
      this.userIdToSpeakerId.get(userId) ?? `spk_${diarizationIndex}`;
    const isCurrentUser = false;

    return {
      speakerId,
      type: "TEAM",
      userId,
      name,
      diarizationIndex,
      isCurrentUser,
      confidence: 1,
    };
  }

  private getConfirmationCounts(userId: string): Map<number, number> {
    let counts = this.confirmationCounts.get(userId);
    if (!counts) {
      counts = new Map();
      this.confirmationCounts.set(userId, counts);
    }
    return counts;
  }
}
