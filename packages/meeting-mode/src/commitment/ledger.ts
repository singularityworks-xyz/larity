import { randomUUID } from "node:crypto";
import { redisKeys } from "@larity/infra/redis/keys";
import { TTL } from "@larity/infra/redis/ttl";
import type { Redis } from "ioredis";
import { ledgerChannel } from "../channels";
import { createMeetingModeLogger } from "../logger";
import { packEmbeddingToBase64, unpackEmbeddingFromBase64 } from "./encoding";
import type {
  Commitment,
  CommitmentCrossSpeakerSearchOptions,
  CommitmentInsertInput,
  CommitmentLedgerEvent,
  CommitmentMatch,
  CommitmentSearchOptions,
  CommitmentStatus,
  CommitmentStatusUpdate,
  LedgerHydrationResult,
} from "./types";
import {
  BruteForceCommitmentVectorIndex,
  type CommitmentVectorIndex,
} from "./vector-index";

const log = createMeetingModeLogger("commitment-ledger");

const DEFAULT_SEARCH_LIMIT = 5;
const SNAPSHOT_VERSION = 1;

const allowedStatusTransitions: Record<
  CommitmentStatus,
  Set<CommitmentStatus>
> = {
  tentative: new Set(["confirmed", "contradicted", "superseded"]),
  confirmed: new Set(["contradicted", "superseded"]),
  contradicted: new Set(["superseded"]),
  superseded: new Set(),
};

interface SnapshotCommitment extends Omit<Commitment, "embedding"> {
  embeddingBase64: string;
}

interface LedgerSnapshot {
  version: number;
  sessionId: string;
  savedAt: number;
  commitments: SnapshotCommitment[];
}

export interface CommitmentLedgerOptions {
  index?: CommitmentVectorIndex;
  now?: () => number;
  idFactory?: () => string;
}

export class CommitmentLedger {
  private readonly redis: Redis;
  private readonly sessionId: string;
  private readonly snapshotKey: string;
  private readonly updatesChannel: string;
  private readonly index: CommitmentVectorIndex;
  private readonly now: () => number;
  private readonly idFactory: () => string;

  private readonly commitments = new Map<string, Commitment>();
  private readonly commitmentToVectorId = new Map<string, number>();
  private readonly vectorToCommitmentId = new Map<number, string>();
  private nextVectorId = 1;

  constructor(
    redis: Redis,
    sessionId: string,
    options: CommitmentLedgerOptions = {}
  ) {
    this.redis = redis;
    this.sessionId = sessionId;
    this.snapshotKey = redisKeys.meetingLedgerSnapshot(sessionId);
    this.updatesChannel = ledgerChannel(sessionId);
    this.index = options.index ?? new BruteForceCommitmentVectorIndex();
    this.now = options.now ?? Date.now;
    this.idFactory = options.idFactory ?? randomUUID;
  }

  async insert(input: CommitmentInsertInput): Promise<Commitment> {
    const commitment: Commitment = {
      id: input.id ?? this.idFactory(),
      statement: input.statement,
      normalizedStatement:
        input.normalizedStatement ??
        normalizeCommitmentStatement(input.statement),
      speaker: input.speaker,
      topicId: input.topicId,
      type: input.type,
      status: input.status ?? "tentative",
      timestamp: input.timestamp,
      utteranceId: input.utteranceId,
      embedding: input.embedding,
      relatedCommitments: dedupeValues(input.relatedCommitments),
      extractedData: input.extractedData,
      contradicts: input.contradicts,
      supersedes: input.supersedes,
    };

    this.addToInMemoryIndex(commitment);
    await this.writeSnapshot();
    await this.publishLedgerEvent("insert", commitment);

    return commitment;
  }

  async updateStatus(
    commitmentId: string,
    update: CommitmentStatusUpdate
  ): Promise<Commitment | undefined> {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      return undefined;
    }

    assertStatusTransition(commitment.status, update.status);

    commitment.status = update.status;

    if (update.relatedCommitments) {
      commitment.relatedCommitments = dedupeValues([
        ...commitment.relatedCommitments,
        ...update.relatedCommitments,
      ]);
    }

    if (update.contradicts !== undefined) {
      commitment.contradicts = update.contradicts;
    }

    if (update.supersedes !== undefined) {
      commitment.supersedes = update.supersedes;
    }

    await this.writeSnapshot();
    await this.publishLedgerEvent("status_change", commitment);

    return commitment;
  }

  search(
    queryEmbedding: number[],
    options: CommitmentSearchOptions = {}
  ): CommitmentMatch[] {
    const limit = options.k ?? DEFAULT_SEARCH_LIMIT;
    const minSimilarity = options.minSimilarity ?? Number.NEGATIVE_INFINITY;

    // Skip similarity queries for empty embeddings to avoid false matches
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    if (this.commitments.size === 0 || limit <= 0) {
      return [];
    }

    const candidateLimit = this.index.size();
    const hits = this.index.search(queryEmbedding, candidateLimit);

    const matches: CommitmentMatch[] = [];

    for (const hit of hits) {
      if (hit.similarity < minSimilarity) {
        continue;
      }

      const commitment = this.resolveCommitmentFromVectorHit(hit.vectorId);
      if (!commitment) {
        continue;
      }

      if (!commitmentMatchesSearchOptions(commitment, options)) {
        continue;
      }

      matches.push({ commitment, similarity: hit.similarity });

      if (matches.length >= limit) {
        break;
      }
    }

    return matches;
  }

  searchCrossSpeaker(
    queryEmbedding: number[],
    options: CommitmentCrossSpeakerSearchOptions
  ): CommitmentMatch[] {
    const { speakerId, ...searchOptions } = options;
    const matches = this.search(queryEmbedding, searchOptions);
    return matches.filter(
      ({ commitment }) => commitment.speaker.speakerId !== speakerId
    );
  }

  getById(commitmentId: string): Commitment | undefined {
    return this.commitments.get(commitmentId);
  }

  getAll(): Commitment[] {
    return [...this.commitments.values()].sort(
      (left, right) => left.timestamp - right.timestamp
    );
  }

  size(): number {
    return this.commitments.size;
  }

  async hydrateFromSnapshot(): Promise<LedgerHydrationResult> {
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
        "Failed to parse commitment ledger snapshot"
      );
      return { loaded: 0, skipped: 0 };
    }

    const snapshot = parsed as Partial<LedgerSnapshot>;

    if (!Array.isArray(snapshot.commitments)) {
      return { loaded: 0, skipped: 0 };
    }

    this.clearInMemoryState();

    let loaded = 0;
    let skipped = 0;

    for (const serialized of snapshot.commitments) {
      try {
        const commitment = deserializeSnapshotCommitment(serialized);
        this.addToInMemoryIndex(commitment);
        loaded += 1;
      } catch {
        skipped += 1;
      }
    }

    log.info(
      { sessionId: this.sessionId, loaded, skipped },
      "Hydrated commitment ledger snapshot"
    );

    return { loaded, skipped };
  }

  async deleteSnapshot(): Promise<void> {
    await this.redis.del(this.snapshotKey);
  }

  async closeAndDeleteSnapshot(): Promise<Commitment[]> {
    const drained = this.getAll();
    await this.deleteSnapshot();
    this.clearInMemoryState();
    return drained;
  }

  closeInMemory(): void {
    this.clearInMemoryState();
  }

  private addToInMemoryIndex(commitment: Commitment): void {
    const vectorId = this.nextVectorId;
    this.nextVectorId += 1;

    this.index.add(vectorId, commitment.embedding);
    this.commitments.set(commitment.id, commitment);
    this.commitmentToVectorId.set(commitment.id, vectorId);
    this.vectorToCommitmentId.set(vectorId, commitment.id);
  }

  private async writeSnapshot(): Promise<void> {
    const snapshot: LedgerSnapshot = {
      version: SNAPSHOT_VERSION,
      sessionId: this.sessionId,
      savedAt: this.now(),
      commitments: this.getAll().map((commitment) => ({
        ...stripEmbedding(commitment),
        embeddingBase64: packEmbeddingToBase64(commitment.embedding),
      })),
    };

    await this.redis.set(
      this.snapshotKey,
      JSON.stringify(snapshot),
      "EX",
      TTL.COMMITMENT_LEDGER
    );
  }

  private async publishLedgerEvent(
    type: CommitmentLedgerEvent["type"],
    commitment: Commitment
  ): Promise<void> {
    const event: CommitmentLedgerEvent = {
      type,
      sessionId: this.sessionId,
      timestamp: this.now(),
      commitment: stripEmbedding(commitment),
    };

    try {
      await this.redis.publish(this.updatesChannel, JSON.stringify(event));
    } catch (error) {
      log.error(
        { err: error, sessionId: this.sessionId, commitmentId: commitment.id },
        "Failed to publish commitment ledger event"
      );
    }
  }

  private clearInMemoryState(): void {
    this.index.clear();
    this.commitments.clear();
    this.commitmentToVectorId.clear();
    this.vectorToCommitmentId.clear();
    this.nextVectorId = 1;
  }

  private resolveCommitmentFromVectorHit(
    vectorId: number
  ): Commitment | undefined {
    const commitmentId = this.vectorToCommitmentId.get(vectorId);
    if (!commitmentId) {
      return undefined;
    }

    return this.commitments.get(commitmentId);
  }
}

function normalizeCommitmentStatement(statement: string): string {
  return statement
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function dedupeValues(values: string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  return [...new Set(values)];
}

function assertStatusTransition(
  currentStatus: CommitmentStatus,
  nextStatus: CommitmentStatus
): void {
  if (currentStatus === nextStatus) {
    return;
  }

  const allowedTransitions = allowedStatusTransitions[currentStatus];
  if (allowedTransitions.has(nextStatus)) {
    return;
  }

  throw new Error(
    `Invalid commitment status transition: ${currentStatus} -> ${nextStatus}`
  );
}

function stripEmbedding(commitment: Commitment): Omit<Commitment, "embedding"> {
  const { embedding: _embedding, ...rest } = commitment;
  return rest;
}

function deserializeSnapshotCommitment(serialized: unknown): Commitment {
  const candidate = serialized as Partial<SnapshotCommitment>;

  if (!candidate.id) {
    throw new Error("Invalid snapshot commitment shape");
  }

  if (
    candidate.embeddingBase64 === undefined ||
    candidate.embeddingBase64 === ""
  ) {
    throw new Error("Invalid snapshot commitment shape");
  }

  return {
    id: candidate.id,
    statement: candidate.statement ?? "",
    normalizedStatement: candidate.normalizedStatement ?? "",
    speaker: candidate.speaker as Commitment["speaker"],
    topicId: candidate.topicId ?? "",
    type: (candidate.type ?? "general") as Commitment["type"],
    status: (candidate.status ?? "tentative") as Commitment["status"],
    timestamp: candidate.timestamp ?? 0,
    utteranceId: candidate.utteranceId ?? "",
    embedding: unpackEmbeddingFromBase64(candidate.embeddingBase64),
    relatedCommitments: candidate.relatedCommitments ?? [],
    extractedData: candidate.extractedData,
    contradicts: candidate.contradicts,
    supersedes: candidate.supersedes,
  };
}

function commitmentMatchesSearchOptions(
  commitment: Commitment,
  options: CommitmentSearchOptions
): boolean {
  if (
    options.excludeCommitmentId &&
    commitment.id === options.excludeCommitmentId
  ) {
    return false;
  }

  if (options.speakerId && commitment.speaker.speakerId !== options.speakerId) {
    return false;
  }

  if (options.topicId && commitment.topicId !== options.topicId) {
    return false;
  }

  if (options.type && commitment.type !== options.type) {
    return false;
  }

  if (options.statuses && !options.statuses.includes(commitment.status)) {
    return false;
  }

  return true;
}
