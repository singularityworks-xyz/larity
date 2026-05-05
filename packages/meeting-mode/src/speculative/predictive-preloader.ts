import { createHash } from "node:crypto";
import type { Constraint, PreloadedContextPayload } from "../constraint/types";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("predictive-preloader");

const TOPIC_KEYWORD_MAP: Record<string, string[]> = {
  pricing: ["price", "cost", "budget", "fee", "rate", "invoice", "discount"],
  timeline: [
    "deadline",
    "delivery",
    "launch",
    "milestone",
    "schedule",
    "date",
    "sprint",
    "quarter",
  ],
  scope: [
    "scope",
    "feature",
    "requirement",
    "deliverable",
    "phase",
    "epic",
    "backlog",
  ],
  legal: [
    "contract",
    "nda",
    "compliance",
    "legal",
    "clause",
    "gdpr",
    "hipaa",
    "regulation",
  ],
  security: [
    "security",
    "vulnerability",
    "breach",
    "encryption",
    "auth",
    "access",
    "policy",
  ],
  resource: [
    "resource",
    "team",
    "hire",
    "headcount",
    "capacity",
    "bandwidth",
    "staff",
  ],
} as const;

const HOT_CACHE_MAX_PER_SESSION = 30;

interface HotCacheEntry {
  constraints: Constraint[];
  lastAccessed: number;
}

export class PredictivePreloader {
  private readonly hotCache = new Map<string, Map<string, HotCacheEntry>>();

  seedFromContext(sessionId: string, payload: PreloadedContextPayload): void {
    const sessionCache = this.getOrCreateSessionCache(sessionId);

    const policyConstraints = buildPolicyConstraints(payload);
    for (const [topic, constraints] of policyConstraints) {
      sessionCache.set(topic, {
        constraints,
        lastAccessed: Date.now(),
      });
    }

    const agendaConstraints = buildAgendaConstraints(payload);
    for (const [topic, constraints] of agendaConstraints) {
      const existing = sessionCache.get(topic);
      if (existing) {
        const merged = mergeConstraints(existing.constraints, constraints);
        existing.constraints = merged;
        existing.lastAccessed = Date.now();
      } else {
        sessionCache.set(topic, {
          constraints,
          lastAccessed: Date.now(),
        });
      }
    }

    log.debug(
      { sessionId, topicCount: sessionCache.size },
      "Predictive preloader seeded from context"
    );
  }

  predictTopics(partialText: string): string[] {
    const normalized = partialText.toLowerCase();
    const matchedTopics: string[] = [];

    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORD_MAP)) {
      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          matchedTopics.push(topic);
          break;
        }
      }
    }

    return matchedTopics;
  }

  prefetch(sessionId: string, topics: string[]): Constraint[] {
    const sessionCache = this.hotCache.get(sessionId);
    if (!sessionCache) {
      return [];
    }

    const constraints: Constraint[] = [];
    const now = Date.now();

    for (const topic of topics) {
      const entry = sessionCache.get(topic);
      if (entry && now - entry.lastAccessed < 300_000) {
        entry.lastAccessed = now;
        constraints.push(...entry.constraints);
      }
    }

    return dedupeConstraints(constraints);
  }

  getHotConstraints(sessionId: string): Constraint[] {
    const sessionCache = this.hotCache.get(sessionId);
    if (!sessionCache) {
      return [];
    }

    const constraints: Constraint[] = [];
    for (const entry of sessionCache.values()) {
      constraints.push(...entry.constraints);
    }
    return dedupeConstraints(constraints);
  }

  addConstraintToCache(
    sessionId: string,
    topicHint: string,
    constraint: Constraint
  ): void {
    const sessionCache = this.getOrCreateSessionCache(sessionId);
    const entry = sessionCache.get(topicHint);
    if (entry) {
      entry.constraints.push(constraint);
      entry.lastAccessed = Date.now();
    } else {
      sessionCache.set(topicHint, {
        constraints: [constraint],
        lastAccessed: Date.now(),
      });
    }

    evictOldestIfNeeded(sessionCache);
  }

  closeSession(sessionId: string): void {
    this.hotCache.delete(sessionId);
  }

  closeAll(): void {
    this.hotCache.clear();
  }

  private getOrCreateSessionCache(
    sessionId: string
  ): Map<string, HotCacheEntry> {
    let cache = this.hotCache.get(sessionId);
    if (!cache) {
      cache = new Map();
      this.hotCache.set(sessionId, cache);
    }
    return cache;
  }
}

function buildPolicyConstraints(
  payload: PreloadedContextPayload
): Map<string, Constraint[]> {
  const result = new Map<string, Constraint[]>();

  for (const guardrail of payload.activePolicyGuardrails) {
    const topics = matchTopicsFromKeywords(guardrail.keywords ?? []);
    const constraint: Constraint = {
      id: `preloaded-guardrail-${guardrail.id}`,
      type: "policy",
      value: `${guardrail.name}: ${guardrail.description}`,
      source: "preloaded",
      confidence: 0.95,
      topicIds: topics,
    };

    for (const topic of topics) {
      const existing = result.get(topic) ?? [];
      existing.push(constraint);
      result.set(topic, existing);
    }
  }

  return result;
}

function buildAgendaConstraints(
  payload: PreloadedContextPayload
): Map<string, Constraint[]> {
  const result = new Map<string, Constraint[]>();

  for (const item of payload.calendarAgendaItems) {
    const topics = matchTopicsFromText(item);
    if (topics.length === 0) {
      continue;
    }

    const constraint: Constraint = {
      id: `agenda-${createHash("sha256").update(item).digest("hex")}`,
      type: "dependency",
      value: item,
      source: "preloaded",
      confidence: 0.7,
      topicIds: topics,
    };

    for (const topic of topics) {
      const existing = result.get(topic) ?? [];
      existing.push(constraint);
      result.set(topic, existing);
    }
  }

  return result;
}

function matchTopicsFromKeywords(keywords: string[]): string[] {
  const matched = new Set<string>();
  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase();
    for (const [topic, topicKeywords] of Object.entries(TOPIC_KEYWORD_MAP)) {
      for (const tk of topicKeywords) {
        if (normalized.includes(tk) || tk.includes(normalized)) {
          matched.add(topic);
          break;
        }
      }
    }
  }
  return [...matched];
}

function matchTopicsFromText(text: string): string[] {
  const normalized = text.toLowerCase();
  const matched: string[] = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORD_MAP)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        matched.push(topic);
        break;
      }
    }
  }

  return matched;
}

function mergeConstraints(
  existing: Constraint[],
  incoming: Constraint[]
): Constraint[] {
  const seen = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  for (const c of incoming) {
    if (!seen.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  }
  return merged;
}

function dedupeConstraints(constraints: Constraint[]): Constraint[] {
  const seen = new Set<string>();
  return constraints.filter((c) => {
    if (seen.has(c.id)) {
      return false;
    }
    seen.add(c.id);
    return true;
  });
}

function evictOldestIfNeeded(cache: Map<string, HotCacheEntry>): void {
  if (cache.size <= HOT_CACHE_MAX_PER_SESSION) {
    return;
  }

  let oldestKey = "";
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [key, entry] of cache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    cache.delete(oldestKey);
  }
}
