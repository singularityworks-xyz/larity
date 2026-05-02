import { prisma } from "../../../infra/prisma/client";
import type { PreloadedContextPayload } from "../constraint/types";
import { createMeetingModeLogger } from "../logger";
import { cosineSimilarity } from "../topic/similarity";
import type { Utterance } from "../utterance/types";
import type { Tier3Result } from "./types";

const log = createMeetingModeLogger("tier3-search");

// We abstract out the adapters so Tier3 doesn't tightly couple to the exact Engine imports,
// but for Prisma we just import it directly since this is the designated place for pgvector checks.
export interface CommitmentLedgerSearchAdapter {
  search(
    sessionId: string,
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Array<{ id: string; score: number }>;
}

export class Tier3SearchEngine {
  private readonly MEMORY_THRESHOLD = 0.7; // ~0.3 cosine distance
  private readonly LEDGER_THRESHOLD = 0.8;

  async evaluate(
    utterance: Utterance,
    payload: PreloadedContextPayload | null,
    commitmentManager: CommitmentLedgerSearchAdapter,
    recentEmbeddings: number[][]
  ): Promise<Tier3Result> {
    const { embedding, sessionId } = utterance;

    if (!embedding || embedding.length === 0) {
      log.warn(
        { utteranceId: utterance.utteranceId },
        "No embedding provided to Tier 3, skipping checks"
      );
      return {
        forceTier4: false,
        noveltyScore: 0,
        memoryMatches: [],
        ledgerMatches: [],
      };
    }

    const tasks = [
      this.checkNovelty(embedding, recentEmbeddings),
      this.searchCommitmentLedger(sessionId, embedding, commitmentManager),
      this.searchMemory(embedding, payload),
    ] as const;

    const [noveltyScore, ledgerMatches, memoryMatches] =
      await Promise.all(tasks);

    // If novelty score is extremely high, this is basically a duplicate of what was just said.
    // However, the rule says:
    // - Memory match found -> force Tier 4
    // - Commitment ledger match found (potential contradiction) -> force Tier 4
    const forceTier4 = memoryMatches.length > 0 || ledgerMatches.length > 0;

    return {
      forceTier4,
      noveltyScore,
      memoryMatches,
      ledgerMatches,
    };
  }

  private checkNovelty(
    embedding: number[],
    recentEmbeddings: number[][]
  ): Promise<number> {
    let maxSim = 0;
    for (const recent of recentEmbeddings) {
      if (recent && recent.length > 0) {
        const sim = cosineSimilarity(embedding, recent);
        if (sim > maxSim) {
          maxSim = sim;
        }
      }
    }
    return Promise.resolve(maxSim);
  }

  private searchCommitmentLedger(
    sessionId: string,
    embedding: number[],
    commitmentManager: CommitmentLedgerSearchAdapter
  ): Promise<Array<{ id: string; score: number }>> {
    try {
      const matches = commitmentManager.search(sessionId, embedding, {
        limit: 3,
        threshold: this.LEDGER_THRESHOLD,
      });
      return Promise.resolve(
        matches.map((m) => ({ id: m.id, score: m.score }))
      );
    } catch (error) {
      log.error(
        { err: error, sessionId },
        "Failed to search commitment ledger in Tier 3"
      );
      return Promise.resolve([]);
    }
  }

  private async searchMemory(
    embedding: number[],
    payload: PreloadedContextPayload | null
  ): Promise<Array<{ type: string; id: string; score: number }>> {
    if (!payload) {
      return [];
    }

    const { clientId, orgId } = payload;
    const matches: Array<{ type: string; id: string; score: number }> = [];

    try {
      // Prisma pgvector raw queries
      const vectorStr = `[${embedding.join(",")}]`;

      // 1. Past Decisions (client-scoped)
      const decisions = await prisma.$queryRaw<
        Array<{ id: string; similarity: number }>
      >`
        SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM decisions
        WHERE "clientId" = ${clientId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT 2;
      `;

      for (const d of decisions) {
        if (d.similarity >= this.MEMORY_THRESHOLD) {
          matches.push({ type: "decision", id: d.id, score: d.similarity });
        }
      }

      // 2. Policy Guardrails (org-scoped)
      const policies = await prisma.$queryRaw<
        Array<{ id: string; similarity: number }>
      >`
        SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM policy_guardrails
        WHERE "orgId" = ${orgId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT 2;
      `;

      for (const p of policies) {
        if (p.similarity >= this.MEMORY_THRESHOLD) {
          matches.push({
            type: "policy_guardrail",
            id: p.id,
            score: p.similarity,
          });
        }
      }

      // 3. Important Points (client-scoped)
      const points = await prisma.$queryRaw<
        Array<{ id: string; similarity: number }>
      >`
        SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM important_points
        WHERE "clientId" = ${clientId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT 2;
      `;

      for (const p of points) {
        if (p.similarity >= this.MEMORY_THRESHOLD) {
          matches.push({
            type: "important_point",
            id: p.id,
            score: p.similarity,
          });
        }
      }
    } catch (error) {
      log.error(
        { err: error, clientId },
        "Failed to execute pgvector search in Tier 3"
      );
    }

    return matches.sort((a, b) => b.score - a.score);
  }
}
