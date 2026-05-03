import { cosineSimilarity } from "../topic/similarity";
import type { Tier2Classification } from "./types";

interface CacheEntry {
  text: string;
  normalizedText: string;
  embedding: number[];
  classification: Tier2Classification;
}

const MAX_CACHE_SIZE = 200;

export class Tier2SemanticCache {
  private readonly sessions = new Map<string, CacheEntry[]>();

  get(
    sessionId: string,
    embedding: number[],
    text: string
  ): Tier2Classification | undefined {
    const entries = this.sessions.get(sessionId);
    if (!entries || entries.length === 0) {
      return undefined;
    }

    const normalized = normalizeText(text);

    for (const entry of entries) {
      if (entry.normalizedText === normalized) {
        this.touch(sessionId, entry);
        return entry.classification;
      }
    }

    for (const entry of entries) {
      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim >= 0.97) {
        this.touch(sessionId, entry);
        return entry.classification;
      }
    }

    return undefined;
  }

  set(
    sessionId: string,
    embedding: number[],
    text: string,
    classification: Tier2Classification
  ): void {
    let entries = this.sessions.get(sessionId);
    if (!entries) {
      entries = [];
      this.sessions.set(sessionId, entries);
    }

    const normalized = normalizeText(text);

    const existing = entries.find((e) => e.normalizedText === normalized);
    if (existing) {
      existing.classification = classification;
      existing.embedding = embedding;
      this.touch(sessionId, existing);
      return;
    }

    if (entries.length >= MAX_CACHE_SIZE) {
      entries.shift();
    }

    entries.push({
      text,
      normalizedText: normalized,
      embedding,
      classification,
    });
  }

  private touch(sessionId: string, entry: CacheEntry): void {
    const entries = this.sessions.get(sessionId);
    if (!entries) {
      return;
    }
    const idx = entries.indexOf(entry);
    if (idx !== -1 && idx < entries.length - 1) {
      entries.splice(idx, 1);
      entries.push(entry);
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
