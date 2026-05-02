import { randomUUID } from "node:crypto";
import { redisKeys } from "@larity/infra/redis/keys";
import { TTL } from "@larity/infra/redis/ttl";
import type { Redis } from "ioredis";
import { constraintChannel } from "../channels";
import { createMeetingModeLogger } from "../logger";
import type {
  Constraint,
  ConstraintHydrationResult,
  ConstraintInsertInput,
  ConstraintLedgerEvent,
  ConstraintType,
} from "./types";

const log = createMeetingModeLogger("constraint-ledger");

const SNAPSHOT_VERSION = 1;

interface ConstraintLedgerSnapshot {
  version: number;
  sessionId: string;
  savedAt: number;
  constraints: Constraint[];
}

export interface ConstraintLedgerOptions {
  now?: () => number;
  idFactory?: () => string;
}

export class ConstraintLedger {
  private readonly redis: Redis;
  private readonly sessionId: string;
  private readonly snapshotKey: string;
  private readonly updatesChannel: string;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private readonly constraints = new Map<string, Constraint>();
  private readonly indexByNormalizedValue = new Map<string, string>();

  constructor(
    redis: Redis,
    sessionId: string,
    options: ConstraintLedgerOptions = {}
  ) {
    this.redis = redis;
    this.sessionId = sessionId;
    this.snapshotKey = redisKeys.meetingConstraintLedger(sessionId);
    this.updatesChannel = constraintChannel(sessionId);
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async insert(input: ConstraintInsertInput): Promise<Constraint> {
    const existingId = this.indexByNormalizedValue.get(
      constraintIndexKey(input.type, input.value)
    );
    if (existingId) {
      const existing = this.constraints.get(existingId);
      if (existing) {
        const mergedTopicIds = dedupeValues([
          ...existing.topicIds,
          ...(input.topicIds ?? []),
        ]);
        const mergedConfidence = Math.max(
          existing.confidence,
          input.confidence
        );
        const mergedConstraint: Constraint = {
          ...existing,
          topicIds: mergedTopicIds,
          confidence: mergedConfidence,
          speaker: existing.speaker ?? input.speaker,
          utteranceId: existing.utteranceId ?? input.utteranceId,
        };

        this.constraints.set(existing.id, mergedConstraint);
        await this.writeSnapshot();
        return mergedConstraint;
      }
    }

    const constraint: Constraint = {
      id: input.id ?? this.idFactory(),
      type: input.type,
      value: input.value.trim(),
      source: input.source,
      utteranceId: input.utteranceId,
      speaker: input.speaker,
      confidence: input.confidence,
      topicIds: dedupeValues(input.topicIds ?? []),
    };

    this.addToIndex(constraint);
    await this.writeSnapshot();
    await this.publishConstraintEvent(constraint);
    return constraint;
  }

  getAll(): Constraint[] {
    return [...this.constraints.values()].sort((left, right) => {
      return left.value.localeCompare(right.value);
    });
  }

  size(): number {
    return this.constraints.size;
  }

  findByValue(value: string, type: ConstraintType): Constraint | undefined {
    const id = this.indexByNormalizedValue.get(constraintIndexKey(type, value));
    if (!id) {
      return undefined;
    }
    return this.constraints.get(id);
  }

  async hydrateFromSnapshot(): Promise<ConstraintHydrationResult> {
    const snapshotPayload = await this.redis.get(this.snapshotKey);
    if (!snapshotPayload) {
      return { loaded: 0, skipped: 0 };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshotPayload);
    } catch (error) {
      log.error(
        { err: error, sessionId: this.sessionId },
        "Failed to parse constraint ledger snapshot"
      );
      return { loaded: 0, skipped: 0 };
    }

    const snapshot = parsed as Partial<ConstraintLedgerSnapshot>;
    if (!Array.isArray(snapshot.constraints)) {
      return { loaded: 0, skipped: 0 };
    }

    this.clearInMemoryState();

    let loaded = 0;
    let skipped = 0;

    for (const serialized of snapshot.constraints) {
      try {
        const constraint = deserializeConstraint(serialized);
        this.addToIndex(constraint);
        loaded += 1;
      } catch {
        skipped += 1;
      }
    }

    return { loaded, skipped };
  }

  async deleteSnapshot(): Promise<void> {
    await this.redis.del(this.snapshotKey);
  }

  closeInMemory(): void {
    this.clearInMemoryState();
  }

  private addToIndex(constraint: Constraint): void {
    this.constraints.set(constraint.id, constraint);
    this.indexByNormalizedValue.set(
      constraintIndexKey(constraint.type, constraint.value),
      constraint.id
    );
  }

  private async writeSnapshot(): Promise<void> {
    const snapshot: ConstraintLedgerSnapshot = {
      version: SNAPSHOT_VERSION,
      sessionId: this.sessionId,
      savedAt: this.now(),
      constraints: this.getAll(),
    };

    await this.redis.set(
      this.snapshotKey,
      JSON.stringify(snapshot),
      "EX",
      TTL.CONSTRAINT_LEDGER
    );
  }

  private async publishConstraintEvent(constraint: Constraint): Promise<void> {
    const event: ConstraintLedgerEvent = {
      type: "insert",
      sessionId: this.sessionId,
      timestamp: this.now(),
      constraint,
    };

    try {
      await this.redis.publish(this.updatesChannel, JSON.stringify(event));
    } catch (error) {
      log.error(
        { err: error, sessionId: this.sessionId, constraintId: constraint.id },
        "Failed to publish constraint ledger event"
      );
    }
  }

  private clearInMemoryState(): void {
    this.constraints.clear();
    this.indexByNormalizedValue.clear();
  }
}

function dedupeValues(values: string[]): string[] {
  return [...new Set(values)];
}

function normalizeConstraintValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function constraintIndexKey(type: ConstraintType, value: string): string {
  return `${type}:${normalizeConstraintValue(value)}`;
}

function deserializeConstraint(candidate: unknown): Constraint {
  const value = candidate as Partial<Constraint>;
  if (!(value.id && value.type && value.value && value.source)) {
    throw new Error("Invalid constraint snapshot shape");
  }

  return {
    id: value.id,
    type: value.type,
    value: value.value,
    source: value.source,
    utteranceId: value.utteranceId,
    speaker: value.speaker,
    confidence: value.confidence ?? 0,
    topicIds: value.topicIds ?? [],
  };
}
