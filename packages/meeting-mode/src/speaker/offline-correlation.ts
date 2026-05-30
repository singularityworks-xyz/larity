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

export interface VadInterval {
  userId: string;
  startTs: number;
  endTs: number;
  role?: "host" | "participant";
}

export interface BatchUtteranceSegment {
  id: string;
  text: string;
  timestamp: number; // relative seconds
  duration: number; // seconds
  channel: number; // 0 or 1
  speaker: string; // initial speaker name
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

  // Close any open intervals
  if (sortedHistory.length > 0) {
    const lastTs =
      sortedHistory.at(-1)?.adjustedTs ?? sortedHistory[0].adjustedTs;
    for (const [userId, active] of activeIntervals.entries()) {
      intervals.push({
        userId,
        startTs: active.startTs,
        endTs: Math.max(active.startTs + 1000, lastTs),
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
 * Computes Jaccard similarity of 2-gram sets of two strings.
 */
export function calculateTextSimilarity(str1: string, str2: string): number {
  const tokenize = (s: string): string[] => {
    return s
      .toLowerCase()
      .replace(NON_WORD_REGEX, "")
      .trim()
      .split(WHITESPACE_SPLIT_REGEX)
      .filter(Boolean);
  };

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
    return 1.0;
  }
  if (w1.length === 0 || w2.length === 0) {
    return 0.0;
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
    return 0.0;
  }

  return intersectionSize / unionSize;
}

/**
 * Formats batch speaker names to premium uppercase format (e.g., "Speaker 0" -> "Speaker A").
 * If there is an existing speaker map in live mappings for this index, use its name.
 */
export function translateBatchSpeakerName(
  speakerLabel: string,
  speakerMappings: Record<string, SessionStateSpeakerMapping>
): string {
  const match = speakerLabel.match(DIGIT_REGEX);
  if (!match) {
    return speakerLabel;
  }

  const idxNum = Number.parseInt(match[0], 10);

  for (const mapping of Object.values(speakerMappings)) {
    if (
      mapping.diarizationIndex === idxNum &&
      mapping.speaker.type === "EXTERNAL"
    ) {
      return mapping.speaker.name;
    }
  }

  const charCode = 65 + (idxNum % 26);
  return `Speaker ${String.fromCharCode(charCode)}`;
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
    const userId = passingCandidates[0].userId;
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
): string | null {
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

  if (bestMatch && bestSim >= 0.7) {
    return bestMatch.speaker.name;
  }

  return null;
}

/**
 * Core speaker correlation engine for a single segment.
 */
function correlateSingleSegment(
  segment: BatchUtteranceSegment,
  vadIntervals: VadInterval[],
  teamMemberMap: Map<string, SessionStateTeamMember>,
  userToNameMap: Map<string, string>,
  liveUtterances: Utterance[],
  connectionStartTime: number,
  connectionStartTimeSec: number,
  hostName: string,
  speakerMappings: Record<string, SessionStateSpeakerMapping>
): string {
  const segmentStartMs = connectionStartTime + segment.timestamp * 1000;
  const segmentEndMs = segmentStartMs + segment.duration * 1000;
  const segmentDurationMs = segment.duration * 1000;

  let correlatedSpeakerName: string | null = null;
  let isAmbiguous = false;

  if (segmentDurationMs > 0) {
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
      correlatedSpeakerName = vadResult.name;

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
      }
    } else if (vadResult.isAmbiguous) {
      isAmbiguous = true;
    }
  }

  // Textual Fallback
  if (!correlatedSpeakerName || isAmbiguous) {
    const fallbackName = textualFallback(
      segment,
      liveUtterances,
      connectionStartTimeSec
    );
    if (fallbackName) {
      correlatedSpeakerName = fallbackName;
    }
  }

  // Channel-based defaults fallback
  if (!correlatedSpeakerName) {
    if (segment.channel === 0) {
      correlatedSpeakerName = hostName;
    } else {
      correlatedSpeakerName = translateBatchSpeakerName(
        segment.speaker,
        speakerMappings
      );
    }
  }

  return correlatedSpeakerName;
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
}): BatchUtteranceSegment[] {
  const {
    batchSegments,
    sessionState,
    liveUtterances,
    connectionStartTime,
    hostName,
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
  const teamMemberMap = new Map(
    sessionState.teamMembers.map((m) => [m.userId, m])
  );

  const userToNameMap = new Map<string, string>();
  for (const member of sessionState.teamMembers) {
    userToNameMap.set(member.userId, member.name);
  }

  const connectionStartTimeSec = connectionStartTime / 1000;
  const resultSegments: BatchUtteranceSegment[] = [];

  for (const segment of batchSegments) {
    const correlatedName = correlateSingleSegment(
      segment,
      vadIntervals,
      teamMemberMap,
      userToNameMap,
      liveUtterances,
      connectionStartTime,
      connectionStartTimeSec,
      hostName,
      sessionState.speakerMappings
    );

    resultSegments.push({
      ...segment,
      speaker: correlatedName,
    });
  }

  return resultSegments;
}
