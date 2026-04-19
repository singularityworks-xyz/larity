import type { Redis } from "ioredis";
import { redisKeys } from "../../../infra/redis/keys";
import { createMeetingModeLogger } from "../logger";
import type { Utterance } from "../utterance/types";
import { ConstraintLedger, type ConstraintLedgerOptions } from "./ledger";
import type {
  Constraint,
  ConstraintHydrationResult,
  ConstraintInsertInput,
  ConstraintType,
  PreloadedContextPayload,
} from "./types";

const log = createMeetingModeLogger("constraint-manager");

const DATE_CONSTRAINT_REGEX =
  /\b(?:by|before|after|on)\s+((?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?)\b/i;
const PERCENT_CONSTRAINT_REGEX = /\b\d{1,3}\s*%/;
const NUMERIC_CAPACITY_REGEX =
  /\b(?:capacity|limit|max(?:imum)?|at most|no more than|only)\s+\d+/i;
const POLICY_CONSTRAINT_REGEX = /\b(?:policy|nda|compliance|security|legal)\b/i;
const DEPENDENCY_CONSTRAINT_REGEX =
  /\b(?:depends on|blocked by|pending|after|before|requires|waiting on)\b/i;
const LEGAL_CONSTRAINT_REGEX = /\b(contract|clause|law|gdpr|hipaa|soc2)\b/i;

export interface ConstraintDetectionResult {
  inserted: Constraint[];
  skipped: Array<{ value: string; reason: "duplicate" }>;
}

export class ConstraintManager {
  private readonly redis: Redis;
  private readonly ledgers = new Map<string, ConstraintLedger>();
  private readonly hydratedSessions = new Set<string>();
  private readonly ledgerOptions: ConstraintLedgerOptions;

  constructor(redis: Redis, options: ConstraintLedgerOptions = {}) {
    this.redis = redis;
    this.ledgerOptions = options;
  }

  getLedger(sessionId: string): ConstraintLedger {
    let ledger = this.ledgers.get(sessionId);

    if (!ledger) {
      ledger = new ConstraintLedger(this.redis, sessionId, this.ledgerOptions);
      this.ledgers.set(sessionId, ledger);
    }

    return ledger;
  }

  async hydrateSession(sessionId: string): Promise<ConstraintHydrationResult> {
    const ledger = this.getLedger(sessionId);
    const fromSnapshot = await ledger.hydrateFromSnapshot();

    const payload = await this.readContextPayload(sessionId);
    const preloadInputs = payload
      ? buildPreloadedConstraintInputs(payload)
      : [];

    let loadedFromContext = 0;
    let skippedFromContext = 0;
    for (const input of preloadInputs) {
      const existing = ledger.findByValue(input.value, input.type);
      if (existing) {
        skippedFromContext += 1;
        continue;
      }
      await ledger.insert(input);
      loadedFromContext += 1;
    }

    this.hydratedSessions.add(sessionId);

    const loaded = fromSnapshot.loaded + loadedFromContext;
    const skipped = fromSnapshot.skipped + skippedFromContext;

    log.info(
      {
        sessionId,
        loaded,
        skipped,
      },
      "Constraint ledger session hydrated"
    );

    return { loaded, skipped };
  }

  async ensureHydrated(sessionId: string): Promise<void> {
    if (this.hydratedSessions.has(sessionId)) {
      return;
    }
    await this.hydrateSession(sessionId);
  }

  async processUtterance(
    utterance: Utterance
  ): Promise<ConstraintDetectionResult> {
    await this.ensureHydrated(utterance.sessionId);

    const ledger = this.getLedger(utterance.sessionId);
    const candidates = extractStructuralConstraintsFromUtterance(utterance);
    const inserted: Constraint[] = [];
    const skipped: Array<{ value: string; reason: "duplicate" }> = [];

    for (const candidate of candidates) {
      const existing = ledger.findByValue(candidate.value, candidate.type);
      if (existing) {
        skipped.push({ value: candidate.value, reason: "duplicate" });
        continue;
      }

      const constraint = await ledger.insert(candidate);
      inserted.push(constraint);
    }

    return { inserted, skipped };
  }

  getAll(sessionId: string): Constraint[] {
    const ledger = this.ledgers.get(sessionId);
    if (!ledger) {
      return [];
    }
    return ledger.getAll();
  }

  closeSession(sessionId: string): void {
    const ledger = this.ledgers.get(sessionId);
    if (!ledger) {
      return;
    }

    ledger.closeInMemory();
    this.ledgers.delete(sessionId);
    this.hydratedSessions.delete(sessionId);
  }

  closeAll(): void {
    const sessionIds = [...this.ledgers.keys()];
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId);
    }
  }

  private async readContextPayload(
    sessionId: string
  ): Promise<PreloadedContextPayload | null> {
    const payload = await this.redis.get(redisKeys.meetingContext(sessionId));
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(payload) as PreloadedContextPayload;
    } catch (error) {
      log.error(
        { err: error, sessionId },
        "Failed to parse preloaded context payload"
      );
      return null;
    }
  }
}

function buildPreloadedConstraintInputs(
  payload: PreloadedContextPayload
): ConstraintInsertInput[] {
  const inputs: ConstraintInsertInput[] = [];

  for (const constraint of payload.knownConstraints) {
    inputs.push({
      id: `preloaded-constraint-${constraint.id}`,
      type: inferConstraintType(constraint.content),
      value: constraint.content,
      source: "preloaded",
      confidence: 0.95,
      topicIds: [],
    });
  }

  for (const decision of payload.openDecisions) {
    inputs.push({
      id: `preloaded-decision-${decision.id}`,
      type: inferConstraintType(`${decision.title} ${decision.content}`),
      value: `${decision.title}: ${decision.content}`,
      source: "preloaded",
      confidence: 0.85,
      topicIds: [],
    });
  }

  for (const guardrail of payload.activePolicyGuardrails) {
    inputs.push({
      id: `preloaded-guardrail-${guardrail.id}`,
      type: "policy",
      value: `${guardrail.name}: ${guardrail.description}`,
      source: "preloaded",
      confidence: 0.95,
      topicIds: [],
    });

    if (guardrail.pattern) {
      inputs.push({
        id: `preloaded-guardrail-pattern-${guardrail.id}`,
        type: "policy",
        value: `${guardrail.name} pattern: ${guardrail.pattern}`,
        source: "preloaded",
        confidence: 0.8,
        topicIds: [],
      });
    }
  }

  return inputs;
}

function extractStructuralConstraintsFromUtterance(
  utterance: Utterance
): ConstraintInsertInput[] {
  const text = utterance.text;
  const candidates: ConstraintInsertInput[] = [];
  const topicIds = utterance.topicId ? [utterance.topicId] : [];

  if (DATE_CONSTRAINT_REGEX.test(text)) {
    candidates.push({
      type: "date",
      value: text,
      source: "meeting",
      utteranceId: utterance.utteranceId,
      speaker: utterance.speaker,
      confidence: 0.75,
      topicIds,
    });
  }

  if (
    PERCENT_CONSTRAINT_REGEX.test(text) ||
    NUMERIC_CAPACITY_REGEX.test(text)
  ) {
    candidates.push({
      type: "capacity",
      value: text,
      source: "meeting",
      utteranceId: utterance.utteranceId,
      speaker: utterance.speaker,
      confidence: 0.7,
      topicIds,
    });
  }

  if (POLICY_CONSTRAINT_REGEX.test(text)) {
    candidates.push({
      type: "policy",
      value: text,
      source: "meeting",
      utteranceId: utterance.utteranceId,
      speaker: utterance.speaker,
      confidence: 0.8,
      topicIds,
    });
  }

  if (DEPENDENCY_CONSTRAINT_REGEX.test(text)) {
    candidates.push({
      type: "dependency",
      value: text,
      source: "meeting",
      utteranceId: utterance.utteranceId,
      speaker: utterance.speaker,
      confidence: 0.7,
      topicIds,
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  return dedupeConstraintCandidates(candidates);
}

function dedupeConstraintCandidates(
  candidates: ConstraintInsertInput[]
): ConstraintInsertInput[] {
  const seen = new Set<string>();
  const deduped: ConstraintInsertInput[] = [];

  for (const candidate of candidates) {
    const key = `${candidate.type}:${normalizeConstraintValue(candidate.value)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function inferConstraintType(text: string): ConstraintType {
  if (POLICY_CONSTRAINT_REGEX.test(text)) {
    return "policy";
  }
  if (DEPENDENCY_CONSTRAINT_REGEX.test(text)) {
    return "dependency";
  }
  if (DATE_CONSTRAINT_REGEX.test(text)) {
    return "date";
  }
  if (
    PERCENT_CONSTRAINT_REGEX.test(text) ||
    NUMERIC_CAPACITY_REGEX.test(text)
  ) {
    return "capacity";
  }
  if (LEGAL_CONSTRAINT_REGEX.test(text)) {
    return "legal";
  }
  return "policy";
}

function normalizeConstraintValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

export type { PreloadedContextPayload } from "./types";
