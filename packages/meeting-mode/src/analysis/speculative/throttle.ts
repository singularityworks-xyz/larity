/**
 * Speculation throttle (P3.1).
 *
 * Without throttling, every Deepgram interim would fire one speculative Tier 2
 * LLM call — dozens per utterance, almost all redundant. The throttle keeps
 * one speculation in flight per session+speaker and only fires a new one when
 * the partial has grown enough to be worth a fresh look:
 *
 * 1. ≥ `SPECULATIVE_THROTTLE_MIN_INTERVAL_MS` (500) since the last speculation
 *    fired for that speaker.
 * 2. ≥ `SPECULATIVE_THROTTLE_MIN_NEW_WORDS` (4) new words since the last
 *    speculated text (prefix growth counts only the appended words; a
 *    revision that diverges from the previous text counts its full length).
 * 3. No in-flight speculation whose text is a prefix of the current partial
 *    (the in-flight result will fuzzy-match the final anyway).
 *
 * Blank texts never speculate — there is nothing to classify.
 */
export const SPECULATIVE_THROTTLE_MIN_INTERVAL_MS = 500;
export const SPECULATIVE_THROTTLE_MIN_NEW_WORDS = 4;

const WHITESPACE_REGEX = /\s+/g;

interface ThrottleState {
  inFlightText: string | null;
  lastFiredAt: number;
  lastText: string;
}

function stateKey(sessionId: string, speakerId: string): string {
  return `${sessionId}:${speakerId}`;
}

function normalizeForPrefix(text: string): string {
  return text.toLowerCase().replace(WHITESPACE_REGEX, " ").trim();
}

export function countWords(text: string): number {
  const normalized = normalizeForPrefix(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(" ").length;
}

/**
 * Words in `current` not covered by `previous`. Growing partials ("we can"
 * → "we can deliver by friday") count only the appended tail; a revision
 * that diverges counts its full length as new.
 */
export function countNewWords(current: string, previous: string): number {
  const next = normalizeForPrefix(current);
  const prev = normalizeForPrefix(previous);
  if (!next) {
    return 0;
  }
  if (!prev) {
    return countWords(next);
  }
  if (next === prev) {
    return 0;
  }
  if (next.startsWith(`${prev} `)) {
    return countWords(next.slice(prev.length));
  }
  return countWords(next);
}

export class SpeculationThrottle {
  private readonly states = new Map<string, ThrottleState>();

  shouldSpeculate(
    sessionId: string,
    speakerId: string,
    text: string,
    now: number = Date.now()
  ): boolean {
    if (!normalizeForPrefix(text)) {
      return false;
    }
    const state = this.states.get(stateKey(sessionId, speakerId));
    if (!state) {
      return true;
    }
    if (now - state.lastFiredAt < SPECULATIVE_THROTTLE_MIN_INTERVAL_MS) {
      return false;
    }
    if (
      countNewWords(text, state.lastText) < SPECULATIVE_THROTTLE_MIN_NEW_WORDS
    ) {
      return false;
    }
    if (
      state.inFlightText !== null &&
      normalizeForPrefix(text).startsWith(
        `${normalizeForPrefix(state.inFlightText)} `
      )
    ) {
      return false;
    }
    return true;
  }

  markStarted(
    sessionId: string,
    speakerId: string,
    text: string,
    now: number = Date.now()
  ): void {
    this.states.set(stateKey(sessionId, speakerId), {
      inFlightText: text,
      lastFiredAt: now,
      lastText: text,
    });
  }

  /**
   * Clear the in-flight marker only when it still refers to the settled
   * speculation — a newer speculation may already have replaced it.
   */
  markSettled(sessionId: string, speakerId: string, text: string): void {
    const state = this.states.get(stateKey(sessionId, speakerId));
    if (state && state.inFlightText === text) {
      state.inFlightText = null;
    }
  }

  closeSession(sessionId: string): void {
    const prefix = `${sessionId}:`;
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) {
        this.states.delete(key);
      }
    }
  }

  closeAll(): void {
    this.states.clear();
  }
}
