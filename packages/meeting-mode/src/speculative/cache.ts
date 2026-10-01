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

const WORD_SPLIT_REGEX = /\s+/;
const PREFIX_WORDS = 3;

function structuredEquiv(
  a: Tier2Classification,
  b: Tier2Classification
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Index key: speaker + first 3 normalized words (P3.4). Partials grow by
 * appending words, so the opening trigram of a partial almost always equals
 * the final's — the bucket holds exactly the entries worth comparing.
 */
function bucketKey(speakerId: string, normalizedText: string): string {
  const words = normalizedText.split(WORD_SPLIT_REGEX).slice(0, PREFIX_WORDS);
  return `${speakerId}|${words.join(" ")}`;
}

interface SessionEntry {
  /** speaker|first-3-words → results (newest last). */
  byKey: Map<string, SpeculativeResult[]>;
  /** speakerId → results (newest last). */
  bySpeaker: Map<string, SpeculativeResult[]>;
  /** FIFO insertion order (newest last) — eviction + write-path dedup. */
  order: SpeculativeResult[];
}

export class SpeculativeCache {
  private readonly sessions = new Map<string, SessionEntry>();

  set(sessionId: string, speakerId: string, result: SpeculativeResult): void {
    let entry = this.sessions.get(sessionId);
    if (!entry) {
      entry = { order: [], bySpeaker: new Map(), byKey: new Map() };
      this.sessions.set(sessionId, entry);
    }

    // Write-path dedup scans the session's insertion order (small, infrequent)
    // with the same semantics as the pre-P3.4 implementation.
    const existingIdx = entry.order.findIndex((r) =>
      structuredEquiv(r.classification, result.classification)
    );
    if (existingIdx === -1) {
      const existingBySpeaker = entry.order.findIndex(
        (r) =>
          r.partialText === result.partialText &&
          r.predictedTopicId === result.predictedTopicId
      );
      if (existingBySpeaker !== -1) {
        this.removeAt(entry, existingBySpeaker);
      }
    } else {
      this.removeAt(entry, existingIdx);
    }

    if (entry.order.length >= SPECULATIVE_MAX_ENTRIES_PER_SESSION) {
      this.removeAt(entry, 0);
    }

    entry.order.push(result);
    this.append(entry.bySpeaker, speakerId, result);
    const normalized = normalizeAlphaNumeric(result.partialText);
    if (normalized) {
      this.append(entry.byKey, bucketKey(speakerId, normalized), result);
    }
  }

  match(
    sessionId: string,
    finalText: string,
    speakerId?: string
  ): SpeculativeMatch {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.order.length === 0) {
      return { matched: false, result: null, mismatchRatio: 1 };
    }

    const normalizedFinal = normalizeAlphaNumeric(finalText);
    if (!normalizedFinal) {
      return { matched: false, result: null, mismatchRatio: 1 };
    }

    const candidates = this.selectCandidates(entry, normalizedFinal, speakerId);
    const { bestResult, bestMismatch } = this.scanCandidates(
      entry,
      candidates,
      normalizedFinal
    );

    if (bestMismatch <= SPECULATIVE_MISMATCH_THRESHOLD && bestResult) {
      return { matched: true, result: bestResult, mismatchRatio: bestMismatch };
    }

    return { matched: false, result: null, mismatchRatio: bestMismatch };
  }

  /**
   * P3.4: compare only this speaker's trigram bucket when the speaker is
   * known; widen to the speaker's other entries, but never to another
   * speaker (that would reintroduce cross-speaker false matches). The
   * whole-session scan is the legacy path when no speaker is supplied.
   */
  private selectCandidates(
    entry: SessionEntry,
    normalizedFinal: string,
    speakerId?: string
  ): SpeculativeResult[] {
    if (speakerId === undefined) {
      return entry.order;
    }
    const bucketed = entry.byKey.get(bucketKey(speakerId, normalizedFinal));
    if (bucketed && bucketed.length > 0) {
      return bucketed;
    }
    return entry.bySpeaker.get(speakerId) ?? [];
  }

  private scanCandidates(
    entry: SessionEntry,
    candidates: SpeculativeResult[],
    normalizedFinal: string
  ): { bestMismatch: number; bestResult: SpeculativeResult | null } {
    const now = Date.now();
    let bestResult: SpeculativeResult | null = null;
    let bestMismatch = 1;

    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      if (!candidate) {
        continue;
      }
      if (now - candidate.createdAt > SPECULATIVE_TTL_MS) {
        this.removeExpired(entry, candidate);
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
    return { bestMismatch, bestResult };
  }

  private removeExpired(
    entry: SessionEntry,
    candidate: SpeculativeResult
  ): void {
    const orderIdx = entry.order.indexOf(candidate);
    if (orderIdx !== -1) {
      this.removeAt(entry, orderIdx);
    }
  }

  private append(
    map: Map<string, SpeculativeResult[]>,
    key: string,
    result: SpeculativeResult
  ): void {
    const list = map.get(key);
    if (list) {
      list.push(result);
    } else {
      map.set(key, [result]);
    }
  }

  private removeAt(entry: SessionEntry, index: number): void {
    const [removed] = entry.order.splice(index, 1);
    if (!removed) {
      return;
    }
    this.removeFrom(entry.byKey, removed);
    this.removeFrom(entry.bySpeaker, removed);
  }

  private removeFrom(
    map: Map<string, SpeculativeResult[]>,
    result: SpeculativeResult
  ): void {
    for (const [key, list] of map) {
      const idx = list.indexOf(result);
      if (idx !== -1) {
        list.splice(idx, 1);
        if (list.length === 0) {
          map.delete(key);
        }
        return;
      }
    }
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
