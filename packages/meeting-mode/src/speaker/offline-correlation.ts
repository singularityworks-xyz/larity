import { createMeetingModeLogger } from "../logger";
import type { Utterance } from "../utterance/types";
import type {
  SessionSpeakerStatePayload,
  SessionStateSpeakerMapping,
  SessionStateTeamMember,
} from "./types";

const log = createMeetingModeLogger("offline-correlation");

const NON_WORD_REGEX = /[^\w\s]/g;
const WHITESPACE_SPLIT_REGEX = /\s+/;
const DIGIT_REGEX = /\d+/;

const RECONCILIATION_WINDOW_SECONDS = 3.0;
const TIMESTAMP_MS_THRESHOLD = 1_000_000_000_000;

/**
 * Maximum duration to assign to a VAD interval whose `vad_silence` packet was
 * never received (lost, delayed, or the session ended abruptly). Keeping this
 * short prevents a missed silence from making a speaker appear active for the
 * rest of the meeting and corrupting all subsequent speaker correlations.
 */
const MAX_UNCLOSED_VAD_INTERVAL_MS = 10_000;

/**
 * Minimum enforced duration for an auto-closed VAD interval. Protects against
 * a degenerate zero-length interval when the only signal for a user is a
 * `vad_speaking` at the exact same timestamp as the last history entry.
 */
const MIN_VAD_INTERVAL_DURATION_MS = 1000;

/**
 * Seconds added to each boundary of a mic segment's time window when testing
 * for overlap with a system segment during acoustic-echo suppression. This
 * grace period absorbs utterance-boundary jitter that arises because Deepgram
 * may return slightly different start/end times for the same audio on the two
 * channels. Kept small (1 s) so that genuinely distinct, close-in-time
 * utterances are never accidentally suppressed.
 */
const ECHO_OVERLAP_GRACE_SEC = 1.0;

/**
 * Minimum bigram-Jaccard similarity between a mic segment and an overlapping
 * system segment for the mic segment to be classified as an acoustic echo and
 * discarded. A score of 0.4 tolerates minor transcription differences between
 * the two channels while remaining high enough to avoid suppressing speech
 * that merely touches the same topic.
 */
const ECHO_SIMILARITY_THRESHOLD = 0.4;

export interface VadInterval {
  endTs: number;
  role?: "host" | "participant";
  startTs: number;
  userId: string;
}

export interface BatchUtteranceSegment {
  channel: number; // 0 or 1
  duration: number; // seconds
  id: string;
  speaker: string; // initial speaker name
  speakerType?: "TEAM" | "EXTERNAL"; // Added type
  text: string;
  timestamp: number; // relative seconds
}

/**
 * Reconstructs VAD intervals from chronological VAD history.
 */
export function reconstructVadIntervals(
  vadHistory: Array<{
    userId: string;
    type: "vad_speaking" | "vad_silence";
    adjustedTs: number;
    role?: "host" | "participant";
  }>
): VadInterval[] {
  const intervals: VadInterval[] = [];
  const activeIntervals = new Map<
    string,
    { startTs: number; role?: "host" | "participant" }
  >();

  const sortedHistory = [...vadHistory].sort(
    (a, b) => a.adjustedTs - b.adjustedTs
  );

  for (const signal of sortedHistory) {
    const { userId, type, adjustedTs, role } = signal;
    if (type === "vad_speaking") {
      if (!activeIntervals.has(userId)) {
        activeIntervals.set(userId, { startTs: adjustedTs, role });
      }
    } else if (type === "vad_silence") {
      const active = activeIntervals.get(userId);
      if (active) {
        intervals.push({
          userId,
          startTs: active.startTs,
          endTs: adjustedTs,
          role: active.role ?? role,
        });
        activeIntervals.delete(userId);
      }
    }
  }

  // Auto-close any intervals whose vad_silence was never received.
  if (sortedHistory.length > 0) {
    const firstTs = sortedHistory[0]?.adjustedTs ?? 0;
    const lastTs = sortedHistory.at(-1)?.adjustedTs ?? firstTs;

    for (const [userId, active] of activeIntervals.entries()) {
      // Step 1 — natural ceiling: the interval cannot extend past the last
      //           known event in the history (lastTs), but must be at least
      //           MIN_VAD_INTERVAL_DURATION_MS long to stay non-trivial.
      const naturalEnd = Math.max(
        active.startTs + MIN_VAD_INTERVAL_DURATION_MS,
        lastTs
      );

      // Step 2 — hard cap: if the natural end overshoots the maximum allowed
      //           duration, clamp it. This prevents a missed silence from
      //           bleeding a speaker's VAD state across the rest of the meeting.
      const cappedEnd = Math.min(
        active.startTs + MAX_UNCLOSED_VAD_INTERVAL_MS,
        naturalEnd
      );

      intervals.push({
        userId,
        startTs: active.startTs,
        endTs: cappedEnd,
        role: active.role,
      });
    }
  }

  return intervals;
}

/**
 * Checks if VAD role matches the physical channel.
 * Channel 0: Mic (Host)
 * Channel 1: System (Participant)
 */
export function isChannelRoleMatchOffline(
  channel: number,
  role?: "host" | "participant"
): boolean {
  if (!role) {
    return true;
  }
  if (channel === 0) {
    return role === "host";
  }
  if (channel === 1) {
    return role === "participant";
  }
  return true;
}

/**
 * Computes overlap between two intervals [a, b] and [x, y] in milliseconds.
 */
function getOverlapDuration(
  a: number,
  b: number,
  x: number,
  y: number
): number {
  const start = Math.max(a, x);
  const end = Math.min(b, y);
  return Math.max(0, end - start);
}

/**
 * Computes Jaccard similarity and containment of 2-gram sets of two strings.
 */
export function calculateTextMetrics(
  str1: string,
  str2: string
): { jaccard: number; containment: number } {
  const tokenize = (s: string): string[] =>
    s
      .toLowerCase()
      .replace(NON_WORD_REGEX, "")
      .trim()
      .split(WHITESPACE_SPLIT_REGEX)
      .filter(Boolean);

  const getBigrams = (words: string[]): string[] => {
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]}_${words[i + 1]}`);
    }
    if (bigrams.length === 0) {
      return words;
    }
    return bigrams;
  };

  const w1 = tokenize(str1);
  const w2 = tokenize(str2);

  if (w1.length === 0 && w2.length === 0) {
    return { jaccard: 1.0, containment: 1.0 };
  }
  if (w1.length === 0 || w2.length === 0) {
    return { jaccard: 0.0, containment: 0.0 };
  }

  const b1 = new Set(getBigrams(w1));
  const b2 = new Set(getBigrams(w2));

  let intersectionSize = 0;
  for (const bigram of b1) {
    if (b2.has(bigram)) {
      intersectionSize++;
    }
  }

  const unionSize = b1.size + b2.size - intersectionSize;
  if (unionSize === 0) {
    return { jaccard: 0.0, containment: 0.0 };
  }

  const jaccard = intersectionSize / unionSize;
  const containment = b1.size === 0 ? 0 : intersectionSize / b1.size;

  return { jaccard, containment };
}

/**
 * Computes Jaccard similarity of 2-gram sets of two strings.
 */
export function calculateTextSimilarity(str1: string, str2: string): number {
  return calculateTextMetrics(str1, str2).jaccard;
}

/**
 * Formats batch speaker names to premium uppercase format (e.g., "Speaker 0" -> "Speaker A").
 * If there is an existing speaker map in live mappings for this index, use its name.
 */
export function translateBatchSpeakerName(
  speakerLabel: string,
  channel: number,
  speakerMappings: Record<string, SessionStateSpeakerMapping>,
  clientName?: string
): { name: string; type: "TEAM" | "EXTERNAL" } {
  const match = speakerLabel.match(DIGIT_REGEX);
  if (!match) {
    return { name: speakerLabel, type: channel === 0 ? "TEAM" : "EXTERNAL" };
  }

  const idxNum = Number.parseInt(match[0], 10);

  const expectedLiveIndex = idxNum + channel * 1000;

  for (const mapping of Object.values(speakerMappings)) {
    if (mapping.diarizationIndex === expectedLiveIndex) {
      if (clientName && mapping.speaker.type === "EXTERNAL") {
        return {
          name: `${clientName} - ${idxNum + 1}`,
          type: mapping.speaker.type,
        };
      }
      return { name: mapping.speaker.name, type: mapping.speaker.type };
    }
  }

  if (clientName && channel === 1) {
    return { name: `${clientName} - ${idxNum + 1}`, type: "EXTERNAL" };
  }

  const charCode = 65 + (idxNum % 26);
  return {
    name: `Speaker ${String.fromCharCode(charCode)}`,
    type: channel === 0 ? "TEAM" : "EXTERNAL",
  };
}

/**
 * Checks VAD activity and returns a matched team member's name if exactly one overlaps >=60%.
 */
function correlateVAD(
  segment: BatchUtteranceSegment,
  segmentStartMs: number,
  segmentEndMs: number,
  segmentDurationMs: number,
  vadIntervals: VadInterval[],
  teamMemberMap: Map<string, SessionStateTeamMember>,
  userToNameMap: Map<string, string>
): { name: string | null; isAmbiguous: boolean; userId: string | null } {
  const candidates: Array<{ userId: string; overlap: number }> = [];

  for (const interval of vadIntervals) {
    const role = interval.role ?? teamMemberMap.get(interval.userId)?.role;
    if (!isChannelRoleMatchOffline(segment.channel, role)) {
      continue;
    }

    const overlap = getOverlapDuration(
      segmentStartMs,
      segmentEndMs,
      interval.startTs,
      interval.endTs
    );
    if (overlap > 0) {
      const existing = candidates.find((c) => c.userId === interval.userId);
      if (existing) {
        existing.overlap += overlap;
      } else {
        candidates.push({ userId: interval.userId, overlap });
      }
    }
  }

  const passingCandidates = candidates.filter(
    (c) => c.overlap >= 0.6 * segmentDurationMs
  );

  if (passingCandidates.length === 1) {
    // biome-ignore lint/style/noNonNullAssertion: guaranteed by length === 1 check
    const userId = passingCandidates[0]!.userId;
    const name = userToNameMap.get(userId) || userId;
    return { name, isAmbiguous: false, userId };
  }

  if (passingCandidates.length > 1) {
    return { name: null, isAmbiguous: true, userId: null };
  }

  return { name: null, isAmbiguous: false, userId: null };
}

/**
 * Performs textual fallback by finding similar live utterances.
 */
function textualFallback(
  segment: BatchUtteranceSegment,
  liveUtterances: Utterance[],
  connectionStartTimeSec: number
): Utterance | null {
  const candidates = liveUtterances.filter((lu) => {
    const luTimeSec =
      lu.timestamp > TIMESTAMP_MS_THRESHOLD
        ? lu.timestamp / 1000
        : lu.timestamp;
    const luRelativeSec = luTimeSec - connectionStartTimeSec;
    return (
      Math.abs(segment.timestamp - luRelativeSec) <=
      RECONCILIATION_WINDOW_SECONDS
    );
  });

  let bestMatch: Utterance | null = null;
  let bestSim = 0.0;

  for (const lu of candidates) {
    const sim = calculateTextSimilarity(segment.text, lu.text);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = lu;
    }
  }

  const threshold = segment.channel === 1 ? 0.3 : 0.7;
  if (bestMatch && bestSim >= threshold) {
    return bestMatch;
  }

  return null;
}

/**
 * Core speaker correlation engine for a single segment.
 */
function checkVadCorrelation(
  segment: BatchUtteranceSegment,
  segmentStartMs: number,
  segmentEndMs: number,
  segmentDurationMs: number,
  vadIntervals: VadInterval[],
  teamMemberMap: Map<string, SessionStateTeamMember>,
  userToNameMap: Map<string, string>,
  liveUtterances: Utterance[],
  connectionStartTimeSec: number
): {
  name: string | null;
  type: "TEAM" | "EXTERNAL" | null;
  isAmbiguous: boolean;
} {
  const vadResult = correlateVAD(
    segment,
    segmentStartMs,
    segmentEndMs,
    segmentDurationMs,
    vadIntervals,
    teamMemberMap,
    userToNameMap
  );

  if (vadResult.name) {
    let correlatedSpeakerType: "TEAM" | "EXTERNAL" = "TEAM";
    let isAmbiguous = false;

    // Live Transcript Cross-Check
    const matchedLiveUtt = liveUtterances.find((lu) => {
      const luTimeSec =
        lu.timestamp > TIMESTAMP_MS_THRESHOLD
          ? lu.timestamp / 1000
          : lu.timestamp;
      const luRelativeSec = luTimeSec - connectionStartTimeSec;
      return (
        Math.abs(segment.timestamp - luRelativeSec) <=
        RECONCILIATION_WINDOW_SECONDS
      );
    });

    if (matchedLiveUtt?.speaker?.type === "EXTERNAL") {
      isAmbiguous = true;
      correlatedSpeakerType = "EXTERNAL";
    }

    return { name: vadResult.name, type: correlatedSpeakerType, isAmbiguous };
  }

  return { name: null, type: null, isAmbiguous: vadResult.isAmbiguous };
}

function correlateSingleSegment(
  segment: BatchUtteranceSegment,
  vadIntervals: VadInterval[],
  teamMemberMap: Map<string, SessionStateTeamMember>,
  userToNameMap: Map<string, string>,
  liveUtterances: Utterance[],
  connectionStartTime: number,
  connectionStartTimeSec: number,
  effectiveHostName: string,
  speakerMappings: Record<string, SessionStateSpeakerMapping>,
  clientName?: string
): { name: string; type: "TEAM" | "EXTERNAL" } {
  const match = segment.speaker.match(DIGIT_REGEX);
  const idxNum = match ? Number.parseInt(match[0], 10) : -1;
  const expectedLiveIndex =
    idxNum === -1 ? -1 : idxNum + segment.channel * 1000;

  if (expectedLiveIndex !== -1) {
    const manualMapping = speakerMappings[expectedLiveIndex.toString()];
    if (manualMapping) {
      return {
        name: manualMapping.speaker.name,
        type: manualMapping.speaker.type,
      };
    }
  }

  const segmentStartMs = connectionStartTime + segment.timestamp * 1000;
  const segmentEndMs = segmentStartMs + segment.duration * 1000;
  const segmentDurationMs = segment.duration * 1000;

  let correlatedSpeakerName: string | null = null;
  let correlatedSpeakerType: "TEAM" | "EXTERNAL" | null = null;
  let isAmbiguous = false;

  if (segmentDurationMs > 0) {
    const vadCheck = checkVadCorrelation(
      segment,
      segmentStartMs,
      segmentEndMs,
      segmentDurationMs,
      vadIntervals,
      teamMemberMap,
      userToNameMap,
      liveUtterances,
      connectionStartTimeSec
    );
    correlatedSpeakerName = vadCheck.name;
    correlatedSpeakerType = vadCheck.type;
    isAmbiguous = vadCheck.isAmbiguous;
  }

  // Textual Fallback
  if (!correlatedSpeakerName || isAmbiguous) {
    const fallbackMatch = textualFallback(
      segment,
      liveUtterances,
      connectionStartTimeSec
    );
    if (fallbackMatch) {
      correlatedSpeakerName = fallbackMatch.speaker.name;
      correlatedSpeakerType = fallbackMatch.speaker.type;
    }
  }

  // Channel-based defaults fallback
  if (!correlatedSpeakerName) {
    if (segment.channel === 0) {
      correlatedSpeakerName = effectiveHostName;
      correlatedSpeakerType = "TEAM";
    } else {
      const translated = translateBatchSpeakerName(
        segment.speaker,
        segment.channel,
        speakerMappings,
        clientName
      );
      correlatedSpeakerName = translated.name;
      correlatedSpeakerType = translated.type;
    }
  }

  const finalType =
    correlatedSpeakerType ?? (segment.channel === 0 ? "TEAM" : "EXTERNAL");
  return { name: correlatedSpeakerName, type: finalType };
}

/**
 * Processes offline correlation, spike filtering, and textual fallback.
 */
export function processOfflineCorrelation(options: {
  batchSegments: BatchUtteranceSegment[];
  sessionState: SessionSpeakerStatePayload;
  liveUtterances: Utterance[];
  connectionStartTime: number;
  hostName: string;
  clientName?: string;
}): BatchUtteranceSegment[] {
  const {
    batchSegments,
    sessionState,
    liveUtterances,
    connectionStartTime,
    hostName,
    clientName,
  } = options;

  log.info(
    {
      segmentCount: batchSegments.length,
      vadSignals: sessionState.vadHistory.length,
      liveCount: liveUtterances.length,
    },
    "Starting offline speaker correlation"
  );

  const vadIntervals = reconstructVadIntervals(sessionState.vadHistory);
  const teamMemberMap = new Map<string, SessionStateTeamMember>(
    sessionState.teamMembers.map((m: SessionStateTeamMember) => [m.userId, m])
  );

  const userToNameMap = new Map<string, string>();
  for (const member of sessionState.teamMembers) {
    userToNameMap.set(member.userId, member.name);
  }

  const connectionStartTimeSec = connectionStartTime / 1000;

  // Resolve the effective host name from authenticated VAD team-member data
  // rather than from the `hostName` Postgres parameter, which may be stale or
  // set to a generic default at the time the offline transcription job runs.
  // If the session somehow registered more than one host-role member (should
  // not occur in practice) we log a diagnostic warning and use the first one.
  const hostMembers = sessionState.teamMembers.filter(
    (m: SessionStateTeamMember) => m.role === "host"
  );
  if (hostMembers.length > 1) {
    log.warn(
      { hostCount: hostMembers.length },
      "Multiple host-role team members in session state; using first for channel-0 fallback"
    );
  }
  const effectiveHostName = hostMembers[0]?.name ?? hostName;

  // Acoustic-echo suppression pass.
  //
  // When the host uses speakers instead of headphones, the remote client's
  // voice leaks back into the microphone. Deepgram then transcribes the same
  // speech on both channel 0 (mic) and channel 1 (system), producing duplicate
  // lines in the transcript. We discard the channel-0 copy when it satisfies
  // both conditions:
  //
  //   1. Temporal overlap: the mic segment's audio window (with a small grace
  //      extension for channel-boundary jitter) overlaps the system segment's
  //      audio window. Proximity alone is NOT sufficient — only actual overlap
  //      triggers the similarity test. This prevents suppression of genuine
  //      host speech that merely follows or precedes the client on the same
  //      topic.
  //
  //   2. Text similarity ≥ ECHO_SIMILARITY_THRESHOLD: the two transcriptions
  //      are similar enough to be the same utterance. A Jaccard bigram score
  //      of 0.4 tolerates minor STT variance between channels.
  const nonEchoSegments = batchSegments.filter((seg0) => {
    if (seg0.channel !== 0) {
      return true;
    }

    // Extend the mic segment's window by ECHO_OVERLAP_GRACE_SEC on each side
    // to absorb minor timing discrepancies between the two Deepgram channels.
    const micExtStart = seg0.timestamp - ECHO_OVERLAP_GRACE_SEC;
    const micExtEnd = seg0.timestamp + seg0.duration + ECHO_OVERLAP_GRACE_SEC;

    const isEcho = batchSegments.some((seg1) => {
      if (seg1.channel !== 1) {
        return false;
      }

      // Condition 1: temporal overlap (with grace extension on the mic side).
      const hasOverlap =
        micExtStart < seg1.timestamp + seg1.duration &&
        seg1.timestamp < micExtEnd;

      if (!hasOverlap) {
        return false;
      }

      // Condition 2: text similarity or containment.
      const metrics = calculateTextMetrics(seg0.text, seg1.text);
      return (
        metrics.jaccard >= ECHO_SIMILARITY_THRESHOLD ||
        metrics.containment >= 0.85
      );
    });

    if (isEcho) {
      log.info(
        { id: seg0.id, text: seg0.text, timestamp: seg0.timestamp },
        "Discarding client-to-mic echo segment in offline correlation"
      );
      return false;
    }
    return true;
  });

  const resultSegments: BatchUtteranceSegment[] = [];

  for (const segment of nonEchoSegments) {
    const correlated = correlateSingleSegment(
      segment,
      vadIntervals,
      teamMemberMap,
      userToNameMap,
      liveUtterances,
      connectionStartTime,
      connectionStartTimeSec,
      effectiveHostName,
      sessionState.speakerMappings,
      clientName
    );

    resultSegments.push({
      ...segment,
      speaker: correlated.name,
      speakerType: correlated.type,
    });
  }

  return resultSegments;
}
