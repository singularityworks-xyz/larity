export interface TalkTimeUtterance {
  speaker: string;
  duration: number;
}

export interface TalkTimeStats {
  [speakerLabel: string]: {
    utteranceCount: number;
    totalSeconds: number;
    talkTimePercent: number;
  };
}

/**
 * Computes talk time statistics for each speaker from their utterances.
 * Rounded to 1 decimal place.
 */
export function computeTalkTime(
  utterances: TalkTimeUtterance[]
): TalkTimeStats {
  const msStats: Record<string, { utteranceCount: number; totalMs: number }> =
    {};
  let totalActiveMs = 0;

  for (const utterance of utterances) {
    const speaker = utterance.speaker || "Unknown";
    const durationMs = Math.round(Math.max(0, utterance.duration || 0) * 1000);

    if (!msStats[speaker]) {
      msStats[speaker] = { utteranceCount: 0, totalMs: 0 };
    }
    msStats[speaker].utteranceCount += 1;
    msStats[speaker].totalMs += durationMs;
    totalActiveMs += durationMs;
  }

  const stats: TalkTimeStats = {};
  for (const speaker of Object.keys(msStats)) {
    const s = msStats[speaker];
    stats[speaker] = {
      utteranceCount: s.utteranceCount,
      totalSeconds: s.totalMs / 1000,
      talkTimePercent:
        totalActiveMs > 0
          ? Math.round((s.totalMs / totalActiveMs) * 1000) / 10
          : 0,
    };
  }

  return stats;
}
