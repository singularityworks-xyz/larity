import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { Tier3SearchEngine } from "../../src/pipeline/tier3";
import type { Utterance } from "../../src/utterance/types";

// Mock the prisma client
mock.module("@larity/infra/prisma/client", () => ({
  prisma: {
    $queryRaw: mock(() => Promise.resolve([])),
  },
}));

import { prisma } from "@larity/infra/prisma/client";

describe("Tier3SearchEngine", () => {
  let engine: Tier3SearchEngine;
  let mockCommitmentManager: any;

  beforeEach(() => {
    engine = new Tier3SearchEngine();
    mockCommitmentManager = {
      search: mock(() => []),
    };
    (prisma.$queryRaw as ReturnType<typeof mock>).mockReset();
    (prisma.$queryRaw as ReturnType<typeof mock>).mockResolvedValue([]);
  });

  const createUtterance = (embedding: number[]): Utterance => ({
    utteranceId: "utt-1",
    sessionId: "sess-1",
    speaker: {
      speakerId: "spk-1",
      type: "TEAM",
      name: "Speaker 1",
      diarizationIndices: [0],
      isCurrentUser: true,
      confidence: 1,
    },
    text: "Test utterance",
    timestamp: Date.now(),
    confidenceScore: 0.9,
    startOffset: 0,
    duration: 1000,
    wordCount: 2,
    mergedCount: 1,
    embedding,
  });

  const createPayload = (): PreloadedContextPayload => ({
    version: 1,
    sessionId: "sess-1",
    meetingId: "meet-1",
    clientId: "client-1",
    orgId: "org-1",
    loadedAt: Date.now(),
    openDecisions: [],
    knownConstraints: [],
    activePolicyGuardrails: [],
    priorCommitments: [],
    clientNameList: [],
    keywordBlocklists: [],
    calendarAgendaItems: [],
  });

  test("should skip checks if no embedding is provided", async () => {
    const utterance = createUtterance([]);
    const result = await engine.evaluate(
      utterance,
      createPayload(),
      mockCommitmentManager,
      []
    );

    expect(result.forceTier4).toBe(false);
    expect(result.noveltyScore).toBe(0);
    expect(result.memoryMatches.length).toBe(0);
    expect(result.ledgerMatches.length).toBe(0);
    expect(mockCommitmentManager.search).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  test("should detect high novelty via recent embeddings", async () => {
    const utterance = createUtterance([1, 0, 0]);
    // Exact same embedding in recent history should give a score of ~1
    const recentEmbeddings = [[1, 0, 0]];

    const result = await engine.evaluate(
      utterance,
      createPayload(),
      mockCommitmentManager,
      recentEmbeddings
    );

    expect(result.noveltyScore).toBeGreaterThan(0.99);
    expect(result.forceTier4).toBe(false); // Novelty alone doesn't force Tier 4
  });

  test("should force Tier 4 if ledger search returns matches", async () => {
    mockCommitmentManager.search.mockReturnValue([
      { commitment: { id: "cmt-1" }, similarity: 0.9 },
    ]);
    const utterance = createUtterance([1, 0, 0]);

    const result = await engine.evaluate(
      utterance,
      createPayload(),
      mockCommitmentManager,
      []
    );

    expect(result.ledgerMatches.length).toBe(1);
    expect(result.ledgerMatches[0].id).toBe("cmt-1");
    expect(result.forceTier4).toBe(true);
  });

  test("should force Tier 4 if memory search returns strong matches", async () => {
    (prisma.$queryRaw as ReturnType<typeof mock>).mockImplementation(
      (strings: TemplateStringsArray, ..._values: unknown[]) => {
        const sql = strings.join("");
        if (sql.includes("FROM decisions")) {
          return Promise.resolve([{ id: "dec-1", similarity: 0.85 }]);
        }
        return Promise.resolve([]);
      }
    );

    const utterance = createUtterance([1, 0, 0]);
    const result = await engine.evaluate(
      utterance,
      createPayload(),
      mockCommitmentManager,
      []
    );

    expect(result.memoryMatches.length).toBe(1);
    expect(result.memoryMatches[0].id).toBe("dec-1");
    expect(result.memoryMatches[0].type).toBe("decision");
    expect(result.forceTier4).toBe(true);
  });

  test("should not force Tier 4 if memory match is below threshold", async () => {
    // Threshold is 0.7, so 0.6 should be ignored (all three pgvector queries run in parallel)
    (prisma.$queryRaw as ReturnType<typeof mock>).mockResolvedValue([
      { id: "dec-1", similarity: 0.6 },
    ]);

    const utterance = createUtterance([1, 0, 0]);
    const result = await engine.evaluate(
      utterance,
      createPayload(),
      mockCommitmentManager,
      []
    );

    expect(result.memoryMatches.length).toBe(0);
    expect(result.forceTier4).toBe(false);
  });

  test("short-circuits pgvector when payload is null and ledger is empty", async () => {
    mockCommitmentManager.search.mockReturnValue([]);
    const utterance = createUtterance([1, 0, 0]);
    const result = await engine.evaluate(
      utterance,
      null,
      mockCommitmentManager,
      []
    );

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.forceTier4).toBe(false);
    expect(result.ledgerMatches.length).toBe(0);
    expect(result.memoryMatches.length).toBe(0);
  });
});
