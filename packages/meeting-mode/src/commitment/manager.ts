import type { Redis } from "ioredis";
import { createMeetingModeLogger } from "../logger";
import { CommitmentLedger, type CommitmentLedgerOptions } from "./ledger";
import type {
  Commitment,
  CommitmentCrossSpeakerSearchOptions,
  CommitmentInsertInput,
  CommitmentMatch,
  CommitmentSearchOptions,
  CommitmentStatusUpdate,
  LedgerHydrationResult,
} from "./types";

const log = createMeetingModeLogger("commitment-manager");

export class CommitmentManager {
  private readonly redis: Redis;
  private readonly ledgers = new Map<string, CommitmentLedger>();
  private readonly ledgerOptions: CommitmentLedgerOptions;

  constructor(redis: Redis, options: CommitmentLedgerOptions = {}) {
    this.redis = redis;
    this.ledgerOptions = options;
  }

  getLedger(sessionId: string): CommitmentLedger {
    let ledger = this.ledgers.get(sessionId);

    if (!ledger) {
      ledger = new CommitmentLedger(this.redis, sessionId, this.ledgerOptions);
      this.ledgers.set(sessionId, ledger);
    }

    return ledger;
  }

  async hydrateSession(sessionId: string): Promise<LedgerHydrationResult> {
    const ledger = this.getLedger(sessionId);
    const hydration = await ledger.hydrateFromSnapshot();

    log.info(
      {
        sessionId,
        loaded: hydration.loaded,
        skipped: hydration.skipped,
      },
      "Commitment ledger session hydrated"
    );

    return hydration;
  }

  addCommitment(
    sessionId: string,
    input: CommitmentInsertInput
  ): Promise<Commitment> {
    const ledger = this.getLedger(sessionId);
    return ledger.insert(input);
  }

  search(
    sessionId: string,
    embedding: number[],
    options: CommitmentSearchOptions = {}
  ): CommitmentMatch[] {
    const ledger = this.getLedger(sessionId);
    return ledger.search(embedding, options);
  }

  searchCrossSpeaker(
    sessionId: string,
    embedding: number[],
    options: CommitmentCrossSpeakerSearchOptions
  ): CommitmentMatch[] {
    const ledger = this.getLedger(sessionId);
    return ledger.searchCrossSpeaker(embedding, options);
  }

  updateStatus(
    sessionId: string,
    commitmentId: string,
    update: CommitmentStatusUpdate
  ): Promise<Commitment | undefined> {
    const ledger = this.getLedger(sessionId);
    return ledger.updateStatus(commitmentId, update);
  }

  getAll(sessionId: string): Commitment[] {
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
  }

  async endSessionAndDeleteSnapshot(sessionId: string): Promise<Commitment[]> {
    const ledger = this.ledgers.get(sessionId);
    if (!ledger) {
      return [];
    }

    const drained = await ledger.closeAndDeleteSnapshot();
    this.ledgers.delete(sessionId);
    return drained;
  }

  closeAll(): void {
    const sessionIds = [...this.ledgers.keys()];
    for (const sessionId of sessionIds) {
      this.closeSession(sessionId);
    }
  }

  getLedgerCount(): number {
    return this.ledgers.size;
  }
}
