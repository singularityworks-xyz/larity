import type { Commitment } from "../commitment/types";
import type { Constraint, PreloadedContextPayload } from "../constraint/types";
import type { SpeakerStateSummary } from "../speaker-state/types";
import type { Utterance } from "../utterance/types";
import type {
  Tier1Result,
  Tier2Classification,
  Tier3Result,
  Tier4CommitmentMatch,
  Tier4Context,
  Tier4HistoricalMatch,
} from "./types";

function stripEmbedding(commitment: Commitment): Omit<Commitment, "embedding"> {
  const { embedding: _, ...rest } = commitment;
  return rest;
}

function utteranceForPrompt(u: Utterance): Omit<Utterance, "embedding"> {
  const { embedding: _, ...rest } = u;
  return rest;
}

function historicalWithoutPayloadRow(
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch {
  return {
    memoryType: m.type,
    sourceId: m.id,
    item: `[${m.type}:${m.id}] (no preload text; similarity ${m.score.toFixed(3)})`,
    similarity: m.score,
  };
}

function historicalPreloadMissRow(
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch {
  return {
    memoryType: m.type,
    sourceId: m.id,
    item: `[${m.type}:${m.id}] preload miss; similarity ${m.score.toFixed(3)}`,
    similarity: m.score,
  };
}

function isoDate(epoch: number): string {
  return new Date(epoch).toISOString();
}

function hydrateDecisionHistorical(
  payload: PreloadedContextPayload,
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch | undefined {
  if (m.type !== "decision") {
    return;
  }
  const decision = payload.openDecisions.find((row) => row.id === m.id);
  if (!decision) {
    return;
  }
  return {
    memoryType: m.type,
    sourceId: m.id,
    item: `${decision.title}: ${decision.content}`,
    meetingDate:
      typeof decision.createdAt === "number"
        ? isoDate(decision.createdAt)
        : undefined,
    similarity: m.score,
  };
}

function hydratePolicyHistorical(
  payload: PreloadedContextPayload,
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch | undefined {
  if (m.type !== "policy_guardrail") {
    return;
  }
  const pol = payload.activePolicyGuardrails.find((row) => row.id === m.id);
  if (!pol) {
    return;
  }
  return {
    memoryType: m.type,
    sourceId: m.id,
    item: `${pol.name}: ${pol.description}`,
    status: pol.severity,
    similarity: m.score,
  };
}

function hydrateImportantHistorical(
  payload: PreloadedContextPayload,
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch | undefined {
  if (m.type !== "important_point") {
    return;
  }
  const prior = payload.priorCommitments.find((row) => row.id === m.id);
  const known =
    prior === undefined
      ? payload.knownConstraints.find((row) => row.id === m.id)
      : undefined;
  const point = prior ?? known;
  if (!point) {
    return;
  }
  return {
    memoryType: m.type,
    sourceId: m.id,
    item: point.content,
    meetingDate:
      typeof point.createdAt === "number"
        ? isoDate(point.createdAt)
        : undefined,
    similarity: m.score,
  };
}

function hydrateOneHistoricalMatch(
  payload: PreloadedContextPayload | null,
  m: Tier3Result["memoryMatches"][number]
): Tier4HistoricalMatch {
  if (!payload) {
    return historicalWithoutPayloadRow(m);
  }

  const fromDecision = hydrateDecisionHistorical(payload, m);
  if (fromDecision) {
    return fromDecision;
  }

  const fromPolicy = hydratePolicyHistorical(payload, m);
  if (fromPolicy) {
    return fromPolicy;
  }

  const fromImportant = hydrateImportantHistorical(payload, m);
  if (fromImportant) {
    return fromImportant;
  }

  return historicalPreloadMissRow(m);
}

/** Hydrate Tier 3 memory match IDs against preloaded context (no DB on hot path). */
export function hydrateTier4HistoricalMatches(
  payload: PreloadedContextPayload | null,
  memoryMatches: Tier3Result["memoryMatches"]
): Tier4HistoricalMatch[] {
  if (memoryMatches.length === 0) {
    return [];
  }

  return memoryMatches.map((m) => hydrateOneHistoricalMatch(payload, m));
}

/** Map Tier 3 ledger matches to hydrated commitments using in-session ledger. */
export function hydrateTier4LedgerMatches(
  ledgerMatches: Tier3Result["ledgerMatches"],
  commitments: readonly Commitment[]
): Tier4CommitmentMatch[] {
  const byId = new Map(commitments.map((c) => [c.id, c]));
  const out: Tier4CommitmentMatch[] = [];

  for (const m of ledgerMatches) {
    const c = byId.get(m.id);
    if (c) {
      out.push({ commitment: c, similarity: m.score });
    }
  }

  return out;
}

/** Cap constraint text for prompts (deterministic truncation). */
function capConstraints(
  constraints: readonly Constraint[],
  limit: number
): Constraint[] {
  const sorted = [...constraints].slice(-limit);

  const capValue = (v: string) => {
    const maxLen = 400;
    if (v.length <= maxLen) {
      return v;
    }
    return `${v.slice(0, maxLen)}…`;
  };

  return sorted.map((constraint) => ({
    ...constraint,
    value: capValue(constraint.value),
  }));
}

export interface Tier4AssemblyInput {
  allCommitments: readonly Commitment[];
  allConstraints: readonly Constraint[];
  maxConstraints?: number;
  payload: PreloadedContextPayload | null;
  recentUtterances: Utterance[];
  speakerStates?: SpeakerStateSummary[];
  tier1: Tier1Result;
  tier2: Tier2Classification;
  tier3: Tier3Result;
  topicSummary: string;
  utterance: Utterance;
}

export function assembleTier4Context(input: Tier4AssemblyInput): Tier4Context {
  const maxConstraints = input.maxConstraints ?? 24;
  const matchedHistoricalItems = hydrateTier4HistoricalMatches(
    input.payload,
    input.tier3.memoryMatches
  );
  const matchedCommitments = hydrateTier4LedgerMatches(
    input.tier3.ledgerMatches,
    input.allCommitments
  );
  const relevantConstraints = capConstraints(
    input.allConstraints,
    maxConstraints
  );

  return {
    triggerUtteranceId: input.utterance.utteranceId,
    sessionId: input.utterance.sessionId,
    utterance: input.utterance.text,
    speaker: input.utterance.speaker,
    topicId: input.utterance.topicId,
    topicSummary: input.topicSummary || "(no topic label)",
    tier1Result: input.tier1,
    tier2Classification: input.tier2,
    recentUtterances: input.recentUtterances,
    matchedHistoricalItems,
    matchedCommitments,
    relevantConstraints,
    speakerStates: input.speakerStates,
  };
}

/** JSON-safe Tier 4 prompt payload (drops vectors / embeddings). */
export function tierContextForPromptPayload(
  ctx: Tier4Context
): Record<string, unknown> {
  return {
    utteranceUnderReview: ctx.utterance,
    utteranceId: ctx.triggerUtteranceId,
    topicId: ctx.topicId,
    topicSummary: ctx.topicSummary,
    speaker: ctx.speaker,
    tier2: ctx.tier2Classification,
    tier1: {
      blocklistHit: ctx.tier1Result.blocklistHit,
      technicalHit: ctx.tier1Result.technicalHit,
      detectionSummary: ctx.tier1Result.detections.slice(0, 12),
    },
    matchedHistoricalItems: ctx.matchedHistoricalItems,
    matchedCommitments: ctx.matchedCommitments.map(
      ({ commitment: c, similarity }) => ({
        similarity,
        commitment: stripEmbedding(c),
      })
    ),
    recentUtterances: ctx.recentUtterances
      .map(utteranceForPrompt)
      .slice(Math.max(0, ctx.recentUtterances.length - 48)),
    relevantConstraints: ctx.relevantConstraints.map((constraint) => ({
      id: constraint.id,
      type: constraint.type,
      value: constraint.value,
      source: constraint.source,
      confidence: constraint.confidence,
    })),
    ...(ctx.speakerStates ? { speakerStates: ctx.speakerStates } : {}),
  };
}
