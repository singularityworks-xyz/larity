import { ACOUSTIC_BLEED_TIMEOUT_MS } from "../env";
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
  retractUtteranceId?: string;
}

interface RecentUtteranceEntry {
  isCurrentUser: boolean;
  normalizedText: string;
  timestamp: number;
  utteranceId: string;
}

interface SessionPreFilterState {
  recent: RecentUtteranceEntry[];
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
    const duplicate = this.findNearDuplicate(state.recent, normalized);

    if (duplicate) {
      const timeDiff = Math.abs(utterance.timestamp - duplicate.timestamp);
      const isBleed =
        timeDiff <= ACOUSTIC_BLEED_TIMEOUT_MS &&
        utterance.speaker.isCurrentUser !== duplicate.isCurrentUser;

      if (isBleed) {
        if (duplicate.isCurrentUser && !utterance.speaker.isCurrentUser) {
          // Case 2: Clean loopback (EXTERNAL) arrives after mic bleed (USER)
          // Keep loopback, retract previous mic bleed
          const idx = state.recent.indexOf(duplicate);
          if (idx !== -1) {
            state.recent[idx] = {
              normalizedText: normalized,
              isCurrentUser: false,
              utteranceId: utterance.utteranceId,
              timestamp: utterance.timestamp,
            };
          }
          return {
            dropped: false,
            retractUtteranceId: duplicate.utteranceId,
          };
        }
        if (!duplicate.isCurrentUser && utterance.speaker.isCurrentUser) {
          // Case 3: Mic bleed (USER) arrives after clean loopback (EXTERNAL)
          // Drop mic bleed, retract it so it's not saved/cluttering
          return {
            dropped: true,
            reason: "near_duplicate",
            retractUtteranceId: utterance.utteranceId,
          };
        }
      }

      // Default: standard duplicate (same speaker type or timeDiff > timeout)
      return { dropped: true, reason: "near_duplicate" };
    }

    state.recent.push({
      normalizedText: normalized,
      isCurrentUser: utterance.speaker.isCurrentUser,
      utteranceId: utterance.utteranceId,
      timestamp: utterance.timestamp,
    });
    if (state.recent.length > RECENT_WINDOW_SIZE) {
      state.recent.shift();
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
      state = { recent: [] };
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

  private findNearDuplicate(
    recent: RecentUtteranceEntry[],
    normalizedUtterance: string
  ): RecentUtteranceEntry | undefined {
    for (let i = recent.length - 1; i >= 0; i -= 1) {
      const entry = recent[i];
      if (
        entry &&
        isNearTextMatch(entry.normalizedText, normalizedUtterance, 0.12)
      ) {
        return entry;
      }
    }
    return;
  }
}
