import type { PreloadedContextPayload } from "../constraint/types";
import type { Utterance } from "../utterance/types";
import {
  extractSlidingWindows,
  isNearTextMatch,
  normalizeAlphaNumeric,
  normalizeForComparison,
  tokenize,
} from "./text-utils";
import type { Tier1Detection, Tier1Result } from "./types";

const ISO_DATE_REGEX = /\b\d{4}-\d{2}-\d{2}\b/g;
const SLASH_DATE_REGEX = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g;
const TIME_REGEX = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g;
const PERCENT_REGEX = /\b\d{1,3}\s*%\b/g;
const CURRENCY_REGEX =
  /(?:[$€£₹]\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?(?:usd|inr|eur|gbp|rs|rupees?)\b)/gi;
const QUANTITY_REGEX =
  /\b\d+\s?(?:hours?|days?|weeks?|months?|people|developers|engineers|tickets?)\b/gi;
const TECHNICAL_PATTERN_REGEXES: ReadonlyArray<{
  type: string;
  regex: RegExp;
}> = [
  { type: "api_key", regex: /\b(?:sk|pk)_[a-z0-9]{20,}\b/gi },
  { type: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  {
    type: "ssh_private_key",
    regex: /-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----/g,
  },
  {
    type: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}\.[A-Za-z0-9._-]{8,}\b/g,
  },
  {
    type: "long_hash",
    regex: /\b[a-f0-9]{32,128}\b/gi,
  },
  {
    type: "password_assignment",
    regex:
      /\b(?:password|passwd|pwd|token|secret|client_secret)\s*[:=]\s*[^\s]{6,}\b/gi,
  },
];

const FUZZY_THRESHOLD = 0.2;

interface SessionTier1State {
  blocklistTerms: string[];
  clientNames: string[];
}

export class Tier1StructuralDetector {
  private readonly sessions = new Map<string, SessionTier1State>();

  seedContext(
    sessionId: string,
    payload: PreloadedContextPayload | null
  ): void {
    this.sessions.set(sessionId, {
      blocklistTerms: payload?.keywordBlocklists ?? [],
      clientNames: payload?.clientNameList ?? [],
    });
  }

  detect(utterance: Utterance): Tier1Result {
    const detections: Tier1Detection[] = [];
    const text = utterance.text;
    const normalized = normalizeForComparison(text);
    const state = this.sessions.get(utterance.sessionId) ?? {
      blocklistTerms: [],
      clientNames: [],
    };

    const dateHits = this.collectRegexMatches(text, [
      ISO_DATE_REGEX,
      SLASH_DATE_REGEX,
      TIME_REGEX,
    ]);
    for (const hit of dateHits) {
      detections.push({ type: "date_time", value: hit });
    }

    const numberHits = this.collectRegexMatches(text, [
      PERCENT_REGEX,
      CURRENCY_REGEX,
      QUANTITY_REGEX,
    ]);
    for (const hit of numberHits) {
      detections.push({ type: "number", value: hit });
    }

    for (const term of state.blocklistTerms) {
      if (this.containsTerm(normalized, term)) {
        detections.push({ type: "blocklist_keyword", value: term });
      }
    }

    for (const clientName of state.clientNames) {
      if (this.containsTerm(normalized, clientName)) {
        detections.push({ type: "client_name", value: clientName });
      }
    }

    for (const pattern of TECHNICAL_PATTERN_REGEXES) {
      const hits = [...text.matchAll(pattern.regex)].map((match) => match[0]);
      for (const hit of hits) {
        if (!hit) {
          continue;
        }
        detections.push({
          type: "technical_pattern",
          value: `${pattern.type}:${hit}`,
        });
      }
    }

    const deduped = dedupeDetections(detections);

    return {
      detections: deduped,
      technicalHit: deduped.some((item) => item.type === "technical_pattern"),
      blocklistHit: deduped.some(
        (item) =>
          item.type === "blocklist_keyword" || item.type === "client_name"
      ),
    };
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.sessions.clear();
  }

  private collectRegexMatches(text: string, regexes: RegExp[]): string[] {
    const results: string[] = [];
    for (const regex of regexes) {
      const matches = [...text.matchAll(regex)].map((match) => match[0]);
      for (const hit of matches) {
        if (hit) {
          results.push(hit);
        }
      }
    }
    return results;
  }

  private containsTerm(normalizedUtterance: string, term: string): boolean {
    const normalizedTerm = normalizeAlphaNumeric(term);
    if (!normalizedTerm) {
      return false;
    }

    if (normalizedUtterance.includes(normalizedTerm)) {
      return true;
    }

    const utteranceTokens = tokenize(normalizedUtterance);
    const termTokens = tokenize(normalizedTerm);
    if (termTokens.length === 0 || utteranceTokens.length < termTokens.length) {
      return false;
    }

    const windows = extractSlidingWindows(utteranceTokens, termTokens.length);
    for (const candidate of windows) {
      if (isNearTextMatch(candidate, normalizedTerm, FUZZY_THRESHOLD)) {
        return true;
      }
    }

    return false;
  }
}

function dedupeDetections(detections: Tier1Detection[]): Tier1Detection[] {
  const seen = new Set<string>();
  const deduped: Tier1Detection[] = [];

  for (const detection of detections) {
    const key = `${detection.type}:${normalizeForComparison(detection.value)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(detection);
  }

  return deduped;
}
