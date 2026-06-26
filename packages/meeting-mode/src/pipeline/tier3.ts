import { prisma } from "@larity/db/client";
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
    options?: { k?: number; minSimilarity?: number }
  ): Array<
    | { commitment: { id: string }; similarity: number }
    /** @deprecated tests / legacy mocks */
    | { id: string; score: number }
  >;
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

    // No org/client memory and no commitments → skip pgvector + ledger search work
    if (!payload) {
      const ledgerProbe = commitmentManager.search(sessionId, embedding, {
        k: 1,
        minSimilarity: this.LEDGER_THRESHOLD,
      });
      if (ledgerProbe.length === 0) {
        const noveltyScore = await this.checkNovelty(
          embedding,
          recentEmbeddings
        );
        return {
          forceTier4: false,
          noveltyScore,
          memoryMatches: [],
          ledgerMatches: [],
        };
      }
    }

    const tasks = [
      this.checkNovelty(embedding, recentEmbeddings),
      this.searchCommitmentLedger(sessionId, embedding, commitmentManager),
      this.searchMemory(embedding, payload),
    ] as const;

    const [noveltyScore, ledgerMatches, memoryMatches] =
      await Promise.all(tasks);

    // Suggest Tier 4: memory or commitment-ledger similarity (potential contradiction).
    // The pipeline engine still respects Tier 2 `shouldStopForDeepReasoning` so low-value
    // lines do not invoke Tier 4 even when ledger embedding matches loosely.
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
        k: 3,
        minSimilarity: this.LEDGER_THRESHOLD,
      });
      return Promise.resolve(
        matches.map((m) => normalizeLedgerSearchRow(m)).filter((row) => row.id)
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
      const vectorStr = `[${embedding.join(",")}]`;

      const [decisions, policies, points] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
          FROM decisions
          WHERE "clientId" = ${clientId} AND embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT 2;
        `,
        prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
          FROM policy_guardrails
          WHERE "orgId" = ${orgId} AND embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT 2;
        `,
        prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
          SELECT id, 1 - (embedding <=> ${vectorStr}::vector) as similarity
          FROM important_points
          WHERE "clientId" = ${clientId} AND embedding IS NOT NULL
          ORDER BY embedding <=> ${vectorStr}::vector
          LIMIT 2;
        `,
      ]);

      for (const d of decisions) {
        if (d.similarity >= this.MEMORY_THRESHOLD) {
          matches.push({ type: "decision", id: d.id, score: d.similarity });
        }
      }

      for (const p of policies) {
        if (p.similarity >= this.MEMORY_THRESHOLD) {
          matches.push({
            type: "policy_guardrail",
            id: p.id,
            score: p.similarity,
          });
        }
      }

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

function normalizeLedgerSearchRow(m: unknown): {
  id: string;
  score: number;
} {
  if (typeof m !== "object" || m === null) {
    return { id: "", score: 0 };
  }

  const row = m as {
    commitment?: { id?: string };
    similarity?: number;
    id?: string;
    score?: number;
  };

  const id = row.commitment?.id ?? row.id ?? "";

  let score = 0;
  if (typeof row.similarity === "number") {
    score = row.similarity;
  } else if (typeof row.score === "number") {
    score = row.score;
  }

  return { id, score };
}
