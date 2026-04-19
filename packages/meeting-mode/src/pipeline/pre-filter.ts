import type { Utterance } from "../utterance/types";
import {
  extractSlidingWindows,
  isNearTextMatch,
  normalizeAlphaNumeric,
  tokenize,
} from "./text-utils";

const MIN_WORDS_REQUIRED = 3;
const RECENT_WINDOW_SIZE = 12;
const ACKNOWLEDGEMENT_PHRASES = new Set([
  "ok",
  "okay",
  "yeah",
  "yep",
  "yup",
  "right",
  "sure",
  "haan",
  "ha",
  "hmm",
  "hmmm",
  "theek hai",
  "thik hai",
  "thik he",
  "mmhmm",
  "mm hmm",
]);

export interface PreFilterDecision {
  dropped: boolean;
  reason?: "too_short" | "acknowledgement" | "near_duplicate";
}

interface SessionPreFilterState {
  recentNormalized: string[];
}

export class PreFilter {
  private readonly sessions = new Map<string, SessionPreFilterState>();

  evaluate(utterance: Utterance): PreFilterDecision {
    const words = tokenize(utterance.text);
    if (words.length < MIN_WORDS_REQUIRED) {
      return { dropped: true, reason: "too_short" };
    }

    const normalized = normalizeAlphaNumeric(utterance.text);
    if (this.isAcknowledgement(normalized)) {
      return { dropped: true, reason: "acknowledgement" };
    }

    const state = this.getSessionState(utterance.sessionId);
    if (this.hasNearDuplicate(state.recentNormalized, normalized)) {
      return { dropped: true, reason: "near_duplicate" };
    }

    state.recentNormalized.push(normalized);
    if (state.recentNormalized.length > RECENT_WINDOW_SIZE) {
      state.recentNormalized.shift();
    }

    return { dropped: false };
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.sessions.clear();
  }

  private getSessionState(sessionId: string): SessionPreFilterState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = { recentNormalized: [] };
      this.sessions.set(sessionId, state);
    }

    return state;
  }

  private isAcknowledgement(normalizedUtterance: string): boolean {
    if (!normalizedUtterance) {
      return false;
    }

    if (ACKNOWLEDGEMENT_PHRASES.has(normalizedUtterance)) {
      return true;
    }

    const utteranceTokens = tokenize(normalizedUtterance);
    if (utteranceTokens.length === 0 || utteranceTokens.length > 4) {
      return false;
    }

    for (const phrase of ACKNOWLEDGEMENT_PHRASES) {
      const phraseTokens = tokenize(phrase);
      const windows = extractSlidingWindows(
        utteranceTokens,
        phraseTokens.length
      );
      for (const candidate of windows) {
        if (isNearTextMatch(candidate, phrase, 0.2)) {
          return true;
        }
      }
    }

    return false;
  }

  private hasNearDuplicate(
    recent: string[],
    normalizedUtterance: string
  ): boolean {
    for (const candidate of recent) {
      if (isNearTextMatch(candidate, normalizedUtterance, 0.12)) {
        return true;
      }
    }

    return false;
  }
}
