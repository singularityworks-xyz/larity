import {
  levenshteinDistance,
  normalizeAlphaNumeric,
} from "../pipeline/text-utils";
import type { Tier2Classification } from "../pipeline/types";
import type { SpeculativeMatch, SpeculativeResult } from "./types";
import {
  SPECULATIVE_MAX_ENTRIES_PER_SESSION,
  SPECULATIVE_MISMATCH_THRESHOLD,
  SPECULATIVE_TTL_MS,
} from "./types";

function structuredEquiv(
  a: Tier2Classification,
  b: Tier2Classification
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface SessionEntry {
  results: SpeculativeResult[];
}

export class SpeculativeCache {
  private readonly sessions = new Map<string, SessionEntry>();

  set(sessionId: string, _speakerId: string, result: SpeculativeResult): void {
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      entry = { results: [] };
      this.sessions.set(sessionId, entry);
    }

    const existingIdx = entry.results.findIndex((r) =>
      structuredEquiv(r.classification, result.classification)
    );
    if (existingIdx !== -1) {
      entry.results.splice(existingIdx, 1);
      entry.results.push(result);
      return;
    }

    const existingBySpeaker = entry.results.findIndex(
      (r) =>
        r.partialText === result.partialText &&
        r.predictedTopicId === result.predictedTopicId
    );
    if (existingBySpeaker !== -1) {
      entry.results.splice(existingBySpeaker, 1);
    }

    if (entry.results.length >= SPECULATIVE_MAX_ENTRIES_PER_SESSION) {
      entry.results.shift();
    }

    entry.results.push(result);
  }

  match(sessionId: string, finalText: string): SpeculativeMatch {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.results.length === 0) {
      return { matched: false, result: null, mismatchRatio: 1 };
    }

    const normalizedFinal = normalizeAlphaNumeric(finalText);
    if (!normalizedFinal) {
      return { matched: false, result: null, mismatchRatio: 1 };
    }

    const now = Date.now();
    let bestResult: SpeculativeResult | null = null;
    let bestMismatch = 1;

    for (let i = entry.results.length - 1; i >= 0; i--) {
      const candidate = entry.results[i];
      if (!candidate) {
        entry.results.splice(i, 1);
        continue;
      }

      if (now - candidate.createdAt > SPECULATIVE_TTL_MS) {
        entry.results.splice(i, 1);
        continue;
      }

      const normalizedPartial = normalizeAlphaNumeric(candidate.partialText);
      if (!normalizedPartial) {
        continue;
      }

      const mismatch = computeMismatchRatio(normalizedPartial, normalizedFinal);

      if (mismatch < bestMismatch) {
        bestMismatch = mismatch;
        bestResult = candidate;
      }
    }

    if (bestMismatch <= SPECULATIVE_MISMATCH_THRESHOLD && bestResult) {
      return { matched: true, result: bestResult, mismatchRatio: bestMismatch };
    }

    return { matched: false, result: null, mismatchRatio: bestMismatch };
  }

  invalidate(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.sessions.clear();
  }
}

function computeMismatchRatio(partial: string, final_: string): number {
  if (partial === final_) {
    return 0;
  }

  if (partial.length === 0) {
    return 1;
  }

  if (final_.length === 0) {
    return 1;
  }

  const distance = levenshteinDistance(partial, final_);
  const maxLen = Math.max(partial.length, final_.length);
  return distance / maxLen;
}
