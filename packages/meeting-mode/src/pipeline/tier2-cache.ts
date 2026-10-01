import { cosineSimilarity } from "../topic/similarity";
import type { Tier2Classification } from "./types";

interface CacheEntry {
  classification: Tier2Classification;
  embedding: number[];
  normalizedText: string;
  text: string;
}

const MAX_CACHE_SIZE = 200;

interface SessionCache {
  /** Exact normalized-text hits, O(1). */
  byText: Map<string, CacheEntry>;
  /** Cosine-scan list in LRU order (most-recently used at the end). */
  vectors: CacheEntry[];
}

export class Tier2SemanticCache {
  private readonly sessions = new Map<string, SessionCache>();

  private getOrCreateSession(sessionId: string): SessionCache {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = { byText: new Map(), vectors: [] };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  get(
    sessionId: string,
    embedding: number[],
    text: string
  ): Tier2Classification | undefined {
    const session = this.sessions.get(sessionId);
    if (!session || session.vectors.length === 0) {
      return;
    }

    const normalized = normalizeText(text);

    const exact = session.byText.get(normalized);
    if (exact) {
      this.touch(session, exact);
      return exact.classification;
    }

    for (const entry of session.vectors) {
      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim >= 0.97) {
        this.touch(session, entry);
        return entry.classification;
      }
    }

    return;
  }

  set(
    sessionId: string,
    embedding: number[],
    text: string,
    classification: Tier2Classification
  ): void {
    const session = this.getOrCreateSession(sessionId);
    const normalized = normalizeText(text);

    const existing = session.byText.get(normalized);
    if (existing) {
      existing.classification = classification;
      existing.embedding = embedding;
      this.touch(session, existing);
      return;
    }

    if (session.vectors.length >= MAX_CACHE_SIZE) {
      const evicted = session.vectors.shift();
      if (evicted) {
        session.byText.delete(evicted.normalizedText);
      }
    }

    const entry: CacheEntry = {
      text,
      normalizedText: normalized,
      embedding,
      classification,
    };
    session.vectors.push(entry);
    session.byText.set(normalized, entry);
  }

  private touch(session: SessionCache, entry: CacheEntry): void {
    const idx = session.vectors.indexOf(entry);
    if (idx !== -1 && idx < session.vectors.length - 1) {
      session.vectors.splice(idx, 1);
      session.vectors.push(entry);
    }
  }

  closeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.sessions.clear();
  }
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}
