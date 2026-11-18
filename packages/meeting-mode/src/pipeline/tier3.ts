import { prisma } from "@larity/db/client";
import type { PreloadedContextPayload } from "../constraint/types";
import { createMeetingModeLogger } from "../logger";
import { cosineSimilarity } from "../topic/similarity";
import type { Utterance } from "../utterance/types";
import { incrementCounter } from "./metrics";
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

export type OrganizationMemoryQuery = (
  strings: TemplateStringsArray,
  ...values: unknown[]
) => Promise<Tier3Result["memoryMatches"]>;

export class Tier3SearchEngine {
  private readonly MEMORY_THRESHOLD = 0.7; // ~0.3 cosine distance
  private readonly LEDGER_THRESHOLD = 0.8;

  private readonly queryMemory: OrganizationMemoryQuery;

  constructor(options: { queryMemory?: OrganizationMemoryQuery } = {}) {
    this.queryMemory =
      options.queryMemory ??
      ((strings, ...values) =>
        prisma.$queryRaw<Tier3Result["memoryMatches"]>(strings, ...values));
  }

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
        memoryStatus: "unavailable",
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
          memoryStatus: "not_configured",
          ledgerMatches: [],
        };
      }
    }

    const tasks = [
      this.checkNovelty(embedding, recentEmbeddings),
      this.searchCommitmentLedger(sessionId, embedding, commitmentManager),
      this.searchMemory(embedding, payload),
    ] as const;

    const [noveltyScore, ledgerMatches, memory] = await Promise.all(tasks);

    // Suggest Tier 4: memory or commitment-ledger similarity (potential contradiction).
    // The pipeline engine still respects Tier 2 `shouldStopForDeepReasoning` so low-value
    // lines do not invoke Tier 4 even when ledger embedding matches loosely.
    const forceTier4 = memory.matches.length > 0 || ledgerMatches.length > 0;

    return {
      forceTier4,
      noveltyScore,
      memoryMatches: memory.matches,
      memoryStatus: memory.status,
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
  ): Promise<{
    matches: Tier3Result["memoryMatches"];
    status: NonNullable<Tier3Result["memoryStatus"]>;
  }> {
    if (!payload) {
      return { matches: [], status: "not_configured" };
    }

    const { clientId, orgId } = payload;
    const vectorStr = `[${embedding.join(",")}]`;
    try {
      // Retrieve evidence text with its rank. Startup preloads are bounded and
      // cannot hydrate every row a vector search may find later in a meeting.
      // One round trip also avoids borrowing three pool connections per utterance.
      const matches = await this.queryMemory`
        SELECT * FROM (
          (SELECT 'decision' AS type, id, title || ': ' || content AS item,
            1 - (embedding <=> ${vectorStr}::vector) AS score,
            "createdAt"::text AS "meetingDate", status::text AS status
           FROM decisions
           WHERE "clientId" = ${clientId} AND status = 'ACTIVE' AND embedding IS NOT NULL
           ORDER BY embedding <=> ${vectorStr}::vector LIMIT 2)
          UNION ALL
          (SELECT 'policy_guardrail' AS type, id, name || ': ' || description AS item,
            1 - (embedding <=> ${vectorStr}::vector) AS score,
            "createdAt"::text AS "meetingDate", 'active' AS status
           FROM policy_guardrails
           WHERE "orgId" = ${orgId} AND "isActive" = true
             AND ("clientId" IS NULL OR "clientId" = ${clientId}) AND embedding IS NOT NULL
           ORDER BY embedding <=> ${vectorStr}::vector LIMIT 2)
          UNION ALL
          (SELECT 'important_point' AS type, id, content AS item,
            1 - (embedding <=> ${vectorStr}::vector) AS score,
            "createdAt"::text AS "meetingDate", category::text AS status
           FROM important_points
           WHERE "clientId" = ${clientId} AND embedding IS NOT NULL
           ORDER BY embedding <=> ${vectorStr}::vector LIMIT 2)
        ) AS evidence
        WHERE score >= ${this.MEMORY_THRESHOLD}
        ORDER BY score DESC;
      `;
      return { matches, status: "ok" };
    } catch (error) {
      log.error(
        { err: error, clientId },
        "Failed to execute pgvector search in Tier 3"
      );
      incrementCounter("pipeline.retrieval_errors_total");
      return { matches: [], status: "unavailable" };
    }
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
