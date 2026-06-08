import { redis } from "@larity/infra/redis";
import { createMeetingModeLogger } from "../logger";
import {
  pipelineSpeakerFinalSourceTotal,
  pipelineSpeakerProvisionalAttemptsTotal,
  pipelineSpeakerProvisionalDiscardsTotal,
  pipelineSpeakerProvisionalHitsTotal,
} from "../pipeline/metrics";
import type { SpeakerIdentity } from "../utterance/types";
import { createUnidentifiedSpeaker } from "../utterance/types";
import { ClockOffsetTracker } from "./clock-offset";
import {
  DEFAULT_SPEAKER_CONFIG,
  type MappingSource,
  type SpeakerIdentifierConfig,
  type SpeakerMapping,
  type VadActivityInterval,
  type VadSignal,
  type VadSpeakerState,
} from "./types";

const log = createMeetingModeLogger("speaker-identifier");

const CLOCK_OFFSET_TTL_SECONDS = 2 * 60 * 60;

/**
 * Maximum duration of a live VAD interval that was never closed by a
 * `vad_silence` packet. When `openInterval` receives a new speak signal more
 * than this many milliseconds after the existing open interval started, it
 * treats the old interval as implicitly ended and opens a fresh one. This
 * matches the cap applied in `getActiveMembersAt` (which uses the same value
 * to bound the effective end of any unclosed interval at query time), so the
 * two code paths stay consistent.
 */
const MAX_VAD_INTERVAL_MS = 10_000;

interface ClockOffsetRedisClient {
  hset(key: string, field: string, value: string): Promise<unknown>;
  expire?(key: string, seconds: number): Promise<unknown>;
}

interface ClockOffsetLogger {
  error(obj: { err: unknown; sessionId: string }, msg: string): void;
}

async function persistClockOffset(
  redisClient: ClockOffsetRedisClient,
  sessionId: string,
  userId: string,
  medianOffset: number,
  logger: ClockOffsetLogger
): Promise<void> {
  try {
    await redisClient.hset(
      `meeting.clock_offsets.${sessionId}`,
      userId,
      medianOffset.toString()
    );
    if (typeof redisClient.expire === "function") {
      await redisClient.expire(
        `meeting.clock_offsets.${sessionId}`,
        CLOCK_OFFSET_TTL_SECONDS
      );
    }
  } catch (err) {
    logger.error({ err, sessionId }, "Failed to persist clock offset to Redis");
  }
}

export class SpeakerIdentifier {
  private readonly sessionId: string;
  private readonly config: SpeakerIdentifierConfig;
  private readonly vadState: Map<string, VadSpeakerState> = new Map();
  private readonly vadIntervalsByUser: Map<string, VadActivityInterval[]> =
    new Map();

  private readonly indexToSpeakerId: Map<number, string> = new Map();
  private readonly speakerMappings: Map<string, SpeakerMapping> = new Map();
  private readonly provisionalIndexToUser: Map<
    number,
    { userId: string; updatedAt: number; confidence: number }
  > = new Map();

  private readonly confirmationCounts: Map<string, Map<number, number>> =
    new Map();
  private readonly userIdToSpeakerId: Map<string, string> = new Map();
  private readonly teamMembers: Map<
    string,
    { userId: string; name: string; role?: "host" | "participant" }
  > = new Map();

  private readonly clockTracker = new ClockOffsetTracker();
  private readonly vadHistory: Array<{
    userId: string;
    type: "vad_speaking" | "vad_silence";
    clientSendTs: number;
    serverReceiveTs: number;
    adjustedTs: number;
    role?: "host" | "participant";
  }> = [];

  constructor(sessionId: string, config?: Partial<SpeakerIdentifierConfig>) {
    this.sessionId = sessionId;
    this.config = { ...DEFAULT_SPEAKER_CONFIG, ...config };
  }

  registerTeamMember(
    userId: string,
    name: string,
    role?: "host" | "participant"
  ): void {
    const existing = this.teamMembers.get(userId);
    this.teamMembers.set(userId, {
      userId,
      name,
      role: role ?? existing?.role,
    });

    const counter = this.userIdToSpeakerId.size;
    if (!this.userIdToSpeakerId.has(userId)) {
      const speakerId = `spk_${counter}`;
      this.userIdToSpeakerId.set(userId, speakerId);
    }
  }

  hydrate(mappings: Map<number, SpeakerMapping>): void {
    for (const [index, mapping] of mappings) {
      const speakerId = mapping.speaker.speakerId;
      this.indexToSpeakerId.set(index, speakerId);
      this.speakerMappings.set(speakerId, mapping);

      if (mapping.speaker.type === "TEAM" && mapping.speaker.userId) {
        this.teamMembers.set(mapping.speaker.userId, {
          userId: mapping.speaker.userId,
          name: mapping.speaker.name,
          role:
            mapping.speaker.isHost || mapping.speaker.isCurrentUser
              ? "host"
              : "participant",
        });
        this.userIdToSpeakerId.set(mapping.speaker.userId, speakerId);

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
    const { userId, type, clientSendTs, serverReceiveTs, role } = signal;

    let teamMember = this.teamMembers.get(userId);
    if (!teamMember) {
      // If participant.join was missed, trust authenticated VAD userId and
      // register a minimal team identity so VAD correlation still works.
      this.registerTeamMember(userId, userId, role);
      teamMember = this.teamMembers.get(userId);
      log.info(
        { sessionId: this.sessionId, userId, role },
        "Auto-registered team member from VAD signal"
      );
    }

    if (!teamMember) {
      return;
    }

    this.clockTracker.addSample(userId, clientSendTs, serverReceiveTs);
    const medianOffset = this.clockTracker.getMedianOffset(userId);
    const adjustedTs = clientSendTs + medianOffset;

    this.vadHistory.push({
      userId,
      type,
      clientSendTs,
      serverReceiveTs,
      adjustedTs,
      role,
    });

    if (redis && typeof redis.hset === "function") {
      persistClockOffset(redis, this.sessionId, userId, medianOffset, log);
    }

    if (type === "vad_speaking") {
      this.vadState.set(userId, { isSpeaking: true, startTs: adjustedTs });
      this.openInterval(userId, adjustedTs);
    } else {
      this.vadState.set(userId, { isSpeaking: false, startTs: adjustedTs });
      this.closeInterval(userId, adjustedTs);
    }
    this.pruneProvisional(Date.now());
  }

  processSttPartial(diarizationIndex: number, eventTimestamp: number): void {
    pipelineSpeakerProvisionalAttemptsTotal.inc();
    if (
      this.indexToSpeakerId.has(diarizationIndex) ||
      this.clockTracker.isUntrusted()
    ) {
      pipelineSpeakerProvisionalDiscardsTotal.inc();
      return;
    }

    this.pruneProvisional(eventTimestamp);
    const correlatedUserId = this.correlate(diarizationIndex, eventTimestamp, {
      useConfirmation: false,
    });
    if (!correlatedUserId) {
      pipelineSpeakerProvisionalDiscardsTotal.inc();
      return;
    }

    this.provisionalIndexToUser.set(diarizationIndex, {
      userId: correlatedUserId,
      updatedAt: eventTimestamp,
      confidence: 0.8,
    });
    pipelineSpeakerProvisionalHitsTotal.inc();
  }

  identifySpeakerForFinal(
    diarizationIndex: number,
    utteranceTimestamp: number
  ): SpeakerIdentity {
    const existingSpeakerId = this.indexToSpeakerId.get(diarizationIndex);
    if (existingSpeakerId) {
      const mapping = this.speakerMappings.get(existingSpeakerId);
      if (mapping && mapping.speaker.type === "TEAM") {
        mapping.lastUtteranceTs = utteranceTimestamp;
        if (mapping.speaker.isHost === undefined && mapping.speaker.userId) {
          mapping.speaker.isHost =
            this.teamMembers.get(mapping.speaker.userId)?.role === "host";
        }
        return mapping.speaker;
      }
    }

    if (this.clockTracker.isUntrusted()) {
      return createUnidentifiedSpeaker(diarizationIndex);
    }
    this.pruneProvisional(utteranceTimestamp);

    const provisional = this.provisionalIndexToUser.get(diarizationIndex);
    if (provisional) {
      const speaker = this.resolveIdentity(
        provisional.userId,
        diarizationIndex,
        utteranceTimestamp,
        "partial_provisional",
        provisional.confidence
      );
      if (speaker.type !== "EXTERNAL") {
        pipelineSpeakerFinalSourceTotal.inc({ source: "partial_provisional" });
        return speaker;
      }
    }

    const correlatedUserId = this.correlate(
      diarizationIndex,
      utteranceTimestamp,
      { useConfirmation: true }
    );

    if (correlatedUserId) {
      const speaker = this.resolveIdentity(
        correlatedUserId,
        diarizationIndex,
        utteranceTimestamp,
        "final_confirmed",
        1
      );
      if (speaker.type !== "EXTERNAL") {
        pipelineSpeakerFinalSourceTotal.inc({ source: "final_confirmed" });
      }
      return speaker;
    }
    pipelineSpeakerFinalSourceTotal.inc({ source: "fallback_external" });
    return createUnidentifiedSpeaker(diarizationIndex);
  }

  identifySpeaker(
    diarizationIndex: number,
    utteranceTimestamp: number
  ): SpeakerIdentity {
    return this.identifySpeakerForFinal(diarizationIndex, utteranceTimestamp);
  }

  private correlate(
    diarizationIndex: number,
    utteranceTimestamp: number,
    options: { useConfirmation: boolean }
  ): string | undefined {
    let speakingMembers = this.getActiveMembersAt(utteranceTimestamp);

    // DUAL-CHANNEL CORRELATION HARDENING
    // Ensure that System Audio (>= 1000) does not correlate with the Host's VAD
    // and Mic Audio (< 1000) does not correlate with a Remote Participant's VAD.
    speakingMembers = speakingMembers.filter((userId) => {
      const member = this.teamMembers.get(userId);
      const isHost = member?.role === "host";
      const isParticipant = member?.role === "participant";

      if (diarizationIndex >= 1000 && isHost) {
        return false; // System audio should never map to the Host
      }
      if (diarizationIndex < 1000 && isParticipant) {
        return false; // Mic audio should never map to a Remote Participant
      }
      return true;
    });

    if (speakingMembers.length === 0) {
      return undefined;
    }

    // Hardened filtering: only consider members whose role matches the physical channel
    const validMembers = speakingMembers.filter((userId) => {
      const member = this.teamMembers.get(userId);
      if (!member) {
        return false;
      }
      return isChannelRoleMatch(diarizationIndex, member.role);
    });

    if (validMembers.length === 1) {
      const userId = validMembers[0] as string;

      if (!options.useConfirmation) {
        return userId;
      }
      const counts = this.getConfirmationCounts(userId);
      const currentCount = (counts.get(diarizationIndex) ?? 0) + 1;
      counts.set(diarizationIndex, currentCount);

      if (currentCount >= this.config.minConfirmationSignals) {
        return userId;
      }
    }

    if (speakingMembers.length === 1 && validMembers.length === 0) {
      const userId = speakingMembers[0] as string;
      const member = this.teamMembers.get(userId);
      log.info(
        { diarizationIndex, userId, role: member?.role },
        "Correlation discarded: role-channel mismatch"
      );
    }

    if (validMembers.length > 1) {
      log.debug(
        {
          diarizationIndex,
          speakingMembers: validMembers,
          count: validMembers.length,
        },
        "Ambiguous correlation: multiple speakers active after role filter"
      );
    }

    return undefined;
  }

  private resolveLateIdentity(
    correlatedUserId: string,
    diarizationIndex: number,
    timestamp: number
  ): SpeakerIdentity {
    return this.resolveIdentity(
      correlatedUserId,
      diarizationIndex,
      timestamp,
      "retroactive_vad",
      0.9
    );
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

    if (this.clockTracker.isUntrusted()) {
      return results;
    }

    for (const pending of pendingUtterances) {
      const existingSpeakerId = this.indexToSpeakerId.get(
        pending.diarizationIndex
      );
      if (existingSpeakerId) {
        const mapping = this.speakerMappings.get(existingSpeakerId);
        if (mapping && mapping.speaker.type === "TEAM") {
          continue;
        }
      }

      const correlatedUserId = this.correlate(
        pending.diarizationIndex,
        pending.timestamp,
        { useConfirmation: true }
      );

      if (correlatedUserId) {
        const speaker = this.resolveLateIdentity(
          correlatedUserId,
          pending.diarizationIndex,
          pending.timestamp
        );

        if (speaker.type !== "EXTERNAL") {
          pipelineSpeakerFinalSourceTotal.inc({ source: "retroactive_vad" });
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
    const speakerId = this.indexToSpeakerId.get(diarizationIndex);
    if (!speakerId) {
      return undefined;
    }
    return this.speakerMappings.get(speakerId);
  }

  getAllMappings(): Map<number, SpeakerMapping> {
    const result = new Map<number, SpeakerMapping>();
    for (const [index, speakerId] of this.indexToSpeakerId) {
      const mapping = this.speakerMappings.get(speakerId);
      if (mapping) {
        result.set(index, mapping);
      }
    }
    return result;
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
    return this.indexToSpeakerId.size;
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
      identifiedSpeakers: this.indexToSpeakerId.size,
      activeVadSignals: activeVad,
    };
  }

  exportSessionState(): {
    vadHistory: Array<{
      userId: string;
      type: "vad_speaking" | "vad_silence";
      clientSendTs: number;
      serverReceiveTs: number;
      adjustedTs: number;
      role?: "host" | "participant";
    }>;
    speakerMappings: Record<string, SpeakerMapping>;
    teamMembers: Array<{
      userId: string;
      name: string;
      role?: "host" | "participant";
    }>;
  } {
    const mappings: Record<string, SpeakerMapping> = {};
    for (const [index, speakerId] of this.indexToSpeakerId) {
      const mapping = this.speakerMappings.get(speakerId);
      if (mapping) {
        mappings[index.toString()] = mapping;
      }
    }

    const members = Array.from(this.teamMembers.values());

    return {
      vadHistory: [...this.vadHistory],
      speakerMappings: mappings,
      teamMembers: members,
    };
  }

  reset(): void {
    this.vadState.clear();
    this.vadIntervalsByUser.clear();
    this.indexToSpeakerId.clear();
    this.speakerMappings.clear();
    this.provisionalIndexToUser.clear();
    this.confirmationCounts.clear();
    this.vadHistory.length = 0;
    log.info({ sessionId: this.sessionId }, "Speaker identifier reset");
  }

  private createTeamIdentity(
    userId: string,
    name: string,
    diarizationIndex: number
  ): SpeakerIdentity {
    let speakerId = this.userIdToSpeakerId.get(userId);

    if (!speakerId || this.speakerMappings.has(speakerId)) {
      speakerId = `spk_${diarizationIndex}_${Date.now()}`;
    }

    const isCurrentUser = false;
    const isHost = this.teamMembers.get(userId)?.role === "host";

    return {
      speakerId,
      type: "TEAM",
      userId,
      name,
      diarizationIndices: [diarizationIndex],
      isCurrentUser,
      confidence: 1,
      isHost,
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

  private getActiveMembersAt(timestamp: number): string[] {
    const speakingMembers: string[] = [];
    const lower = timestamp - this.config.correlationWindowMs;
    const upper = timestamp + this.config.correlationWindowMs;

    for (const [userId, intervals] of this.vadIntervalsByUser) {
      for (let i = intervals.length - 1; i >= 0; i -= 1) {
        const interval = intervals[i];
        if (!interval) {
          continue;
        }
        // Cap open VAD intervals at MAX_VAD_INTERVAL_MS to prevent a missed
        // vad_silence from bleeding the speaker's active state indefinitely.
        const isClosed = interval.endTs !== undefined;
        const endTs = interval.endTs ?? interval.startTs + MAX_VAD_INTERVAL_MS;
        const effectiveLower = isClosed
          ? timestamp - this.config.vadTrailingCooldownMs
          : lower;

        const overlaps = interval.startTs <= upper && endTs >= effectiveLower;
        if (overlaps) {
          speakingMembers.push(userId);
          break;
        }
        if (endTs < lower) {
          break;
        }
      }
    }
    return speakingMembers;
  }

  private resolveIdentity(
    correlatedUserId: string,
    diarizationIndex: number,
    utteranceTimestamp: number,
    source: MappingSource,
    confidence: number
  ): SpeakerIdentity {
    const teamMember = this.teamMembers.get(correlatedUserId);
    if (!teamMember) {
      return createUnidentifiedSpeaker(diarizationIndex);
    }
    const targetSpeakerId = this.userIdToSpeakerId.get(correlatedUserId);

    if (targetSpeakerId) {
      const existingMapping = this.speakerMappings.get(targetSpeakerId);
      if (existingMapping) {
        // Channel-aware merge guard: only merge if the new diarizationIndex
        // belongs to the same channel class (mic vs system) as the existing indices of this mapping.
        const isSameChannelClass =
          existingMapping.speaker.diarizationIndices.every(
            (idx) => idx >= 1000 === diarizationIndex >= 1000
          );
        if (isSameChannelClass) {
          if (
            !existingMapping.speaker.diarizationIndices.includes(
              diarizationIndex
            )
          ) {
            existingMapping.speaker.diarizationIndices.push(diarizationIndex);
          }
          existingMapping.lastUtteranceTs = Math.max(
            existingMapping.lastUtteranceTs,
            utteranceTimestamp
          );
          existingMapping.source = source;
          existingMapping.confidence = Math.max(
            existingMapping.confidence,
            confidence
          );
          this.indexToSpeakerId.set(diarizationIndex, targetSpeakerId);
          this.provisionalIndexToUser.delete(diarizationIndex);
          return existingMapping.speaker;
        }

        log.warn(
          {
            diarizationIndex,
            correlatedUserId,
            existingIndices: existingMapping.speaker.diarizationIndices,
          },
          "Channel class mismatch: refusing to merge diarization index into existing user mapping"
        );
        return createUnidentifiedSpeaker(diarizationIndex);
      }
    }

    const speaker = this.createTeamIdentity(
      correlatedUserId,
      teamMember.name,
      diarizationIndex
    );
    const mapping: SpeakerMapping = {
      diarizationIndex,
      speaker,
      confirmedAt: Date.now(),
      confidence,
      lastUtteranceTs: utteranceTimestamp,
      source,
    };
    this.indexToSpeakerId.set(diarizationIndex, speaker.speakerId);
    this.speakerMappings.set(speaker.speakerId, mapping);
    this.provisionalIndexToUser.delete(diarizationIndex);

    log.info(
      {
        diarizationIndex,
        userId: correlatedUserId,
        name: teamMember.name,
        source,
      },
      "Speaker identified as team member"
    );
    return speaker;
  }

  private openInterval(userId: string, adjustedTs: number): void {
    const intervals = this.vadIntervalsByUser.get(userId) ?? [];
    const latest = intervals.at(-1);
    if (latest && latest.endTs === undefined) {
      if (adjustedTs > latest.startTs + MAX_VAD_INTERVAL_MS) {
        // The previous interval was never closed and has now exceeded the
        // maximum allowed duration. Implicitly close it at the cap boundary
        // and start a fresh interval for this new speak event.
        latest.endTs = latest.startTs + MAX_VAD_INTERVAL_MS;
        intervals.push({ userId, startTs: adjustedTs });
      } else {
        // Duplicate or out-of-order speak signal within the same interval;
        // keep the earliest known start time.
        latest.startTs = Math.min(latest.startTs, adjustedTs);
      }
    } else {
      intervals.push({ userId, startTs: adjustedTs });
    }
    this.trimIntervals(intervals);
    this.vadIntervalsByUser.set(userId, intervals);
  }

  private closeInterval(userId: string, adjustedTs: number): void {
    const intervals = this.vadIntervalsByUser.get(userId) ?? [];
    const latest = intervals.at(-1);
    if (latest && latest.endTs === undefined) {
      latest.endTs = adjustedTs;
    } else {
      intervals.push({ userId, startTs: adjustedTs, endTs: adjustedTs });
    }
    this.trimIntervals(intervals);
    this.vadIntervalsByUser.set(userId, intervals);
  }

  private trimIntervals(intervals: VadActivityInterval[]): void {
    const overflow = intervals.length - this.config.maxVadIntervalsPerUser;
    if (overflow > 0) {
      intervals.splice(0, overflow);
    }
  }

  private pruneProvisional(now: number): void {
    const minTs = now - this.config.provisionalTtlMs;
    for (const [idx, entry] of this.provisionalIndexToUser) {
      if (entry.updatedAt < minTs) {
        this.provisionalIndexToUser.delete(idx);
      }
    }
  }
}

/**
 * Hardened role-to-channel isolation:
 * - System Audio (indices 1000+) MUST NOT correlate to the Host (Mic).
 * - Mic Audio (indices 0-999) MUST NOT correlate to a Participant (System).
 */
function isChannelRoleMatch(
  diarizationIndex: number,
  role?: "host" | "participant"
): boolean {
  const isSystemChannel = diarizationIndex >= 1000;
  const effectiveRole = role || "host"; // Default to host if role is unknown

  if (effectiveRole === "host") {
    // Host must NOT be on a system channel
    return !isSystemChannel;
  }
  // Participant MUST be on a system channel
  return isSystemChannel;
}
