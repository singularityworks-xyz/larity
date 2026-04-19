import type { PreloadedContextPayload } from "../constraint/types";
import { createMeetingModeLogger } from "../logger";
import type { TopicState } from "../topic/types";
import type { Utterance } from "../utterance/types";
import { PreFilter } from "./pre-filter";
import { Tier1StructuralDetector } from "./tier1";
import { Tier2Classifier } from "./tier2";
import type { Tier1Result, Tier2Classification, Tier2Input } from "./types";

const log = createMeetingModeLogger("pipeline-engine");

const PERF = {
  now: () => performance.now(),
};

interface PipelineFinalizerAdapter {
  getRecentSameSpeakerText(
    sessionId: string,
    speakerId: string,
    currentUtteranceId?: string,
    limit?: number
  ): string[];
  applyTier2TopicDelta(
    sessionId: string,
    topicId: string | undefined,
    delta: NonNullable<Tier2Classification["topicDelta"]>
  ): Promise<void>;
}

interface ConstraintManagerAdapter {
  ensureHydrated(sessionId: string): Promise<void>;
  processUtterance(utterance: Utterance): Promise<unknown>;
}

interface CommitmentManagerAdapter {
  hydrateSession(sessionId: string): Promise<unknown>;
  addCommitment(
    sessionId: string,
    input: {
      statement: string;
      normalizedStatement?: string;
      speaker: Utterance["speaker"];
      topicId: string;
      type:
        | "timeline"
        | "scope"
        | "resource"
        | "price"
        | "capability"
        | "general";
      timestamp: number;
      utteranceId: string;
      embedding: number[];
      extractedData?: {
        deadline?: string;
        quantity?: number;
        scope?: string[];
        amount?: number;
        currency?: string;
      };
    }
  ): Promise<unknown>;
}

export interface PipelineEngineDependencies {
  finalizer: PipelineFinalizerAdapter;
  constraintManager: ConstraintManagerAdapter;
  commitmentManager: CommitmentManagerAdapter;
  getContextPayload: (
    sessionId: string
  ) => Promise<PreloadedContextPayload | null>;
  getCurrentTopicLabel?: (
    sessionId: string,
    topicId: string | undefined
  ) => Promise<string | undefined>;
  preFilter?: PreFilter;
  tier1?: Tier1StructuralDetector;
  tier2?: Tier2Classifier;
}

export interface PipelineEvaluationResult {
  dropped: boolean;
  dropReason?: string;
  tier1?: Tier1Result;
  tier2?: Tier2Classification;
  tier3Placeholder: { ran: boolean };
  runTier4: boolean;
  latencies: {
    preFilterMs: number;
    tier1Ms?: number;
    tier2Ms?: number;
    gateMs?: number;
    pipelineBudgetMs?: number;
  };
}

interface SessionPipelineState {
  hydrated: boolean;
}

export class MeetingPipelineEngine {
  private readonly preFilter: PreFilter;
  private readonly tier1: Tier1StructuralDetector;
  private readonly tier2: Tier2Classifier;
  private readonly sessions = new Map<string, SessionPipelineState>();

  private readonly finalizer: PipelineFinalizerAdapter;
  private readonly constraintManager: ConstraintManagerAdapter;
  private readonly commitmentManager: CommitmentManagerAdapter;
  private readonly getContextPayload: PipelineEngineDependencies["getContextPayload"];
  private readonly getCurrentTopicLabel: NonNullable<
    PipelineEngineDependencies["getCurrentTopicLabel"]
  >;

  constructor(deps: PipelineEngineDependencies) {
    this.preFilter = deps.preFilter ?? new PreFilter();
    this.tier1 = deps.tier1 ?? new Tier1StructuralDetector();
    this.tier2 = deps.tier2 ?? new Tier2Classifier();
    this.finalizer = deps.finalizer;
    this.constraintManager = deps.constraintManager;
    this.commitmentManager = deps.commitmentManager;
    this.getContextPayload = deps.getContextPayload;
    this.getCurrentTopicLabel =
      deps.getCurrentTopicLabel ?? (async () => undefined);
  }

  async evaluateUtterance(
    utterance: Utterance
  ): Promise<PipelineEvaluationResult> {
    const start = PERF.now();
    await this.ensureSessionHydrated(utterance.sessionId);

    const preFilterStart = PERF.now();
    const decision = this.preFilter.evaluate(utterance);
    const preFilterMs = PERF.now() - preFilterStart;

    if (decision.dropped) {
      return {
        dropped: true,
        dropReason: decision.reason,
        tier3Placeholder: { ran: false },
        runTier4: false,
        latencies: {
          preFilterMs,
          pipelineBudgetMs: PERF.now() - start,
        },
      };
    }

    const tier1Start = PERF.now();
    const tier1Task = Promise.resolve(this.tier1.detect(utterance));

    const tier2Start = PERF.now();
    const tier2Task = this.runTier2(utterance);

    const [tier1, tier2] = await Promise.all([tier1Task, tier2Task]);
    const tier1Ms = PERF.now() - tier1Start;
    const tier2Ms = PERF.now() - tier2Start;

    try {
      await this.constraintManager.processUtterance(utterance);
    } catch (error) {
      log.warn(
        { err: error, utteranceId: utterance.utteranceId },
        "Constraint processing failed in pipeline"
      );
    }

    const gateStart = PERF.now();
    const highSignal =
      tier1.blocklistHit ||
      tier1.technicalHit ||
      tier2.classification.intent === "commitment" ||
      tier2.classification.intent === "decision" ||
      tier2.classification.intent === "concern" ||
      tier2.classification.riskSignals.length > 0;

    const runTier4 = highSignal && !tier2.shouldStopForDeepReasoning;
    const gateMs = PERF.now() - gateStart;

    return {
      dropped: false,
      tier1,
      tier2: tier2.classification,
      tier3Placeholder: { ran: true },
      runTier4,
      latencies: {
        preFilterMs,
        tier1Ms,
        tier2Ms,
        gateMs,
        pipelineBudgetMs: PERF.now() - start,
      },
    };
  }

  closeSession(sessionId: string): void {
    this.preFilter.closeSession(sessionId);
    this.tier1.closeSession(sessionId);
    this.sessions.delete(sessionId);
  }

  closeAll(): void {
    this.preFilter.closeAll();
    this.tier1.closeAll();
    this.sessions.clear();
  }

  private async runTier2(utterance: Utterance): Promise<{
    classification: Tier2Classification;
    shouldStopForDeepReasoning: boolean;
  }> {
    const recentSameSpeaker = this.finalizer.getRecentSameSpeakerText(
      utterance.sessionId,
      utterance.speaker.speakerId,
      utterance.utteranceId,
      3
    );

    const topicLabel = await this.getCurrentTopicLabel(
      utterance.sessionId,
      utterance.topicId
    );

    const input: Tier2Input = {
      utterance: utterance.text,
      speaker: utterance.speaker,
      recentSameSpeaker,
      topicLabel,
    };

    const tier2 = await this.tier2.classify(input);

    if (tier2.classification.topicDelta && utterance.topicId) {
      await this.finalizer.applyTier2TopicDelta(
        utterance.sessionId,
        utterance.topicId,
        tier2.classification.topicDelta
      );
    }

    if (
      tier2.classification.intent === "commitment" ||
      tier2.classification.intent === "decision"
    ) {
      const type =
        tier2.classification.commitmentType ??
        (tier2.classification.intent === "decision" ? "scope" : "general");

      try {
        await this.commitmentManager.addCommitment(utterance.sessionId, {
          statement: utterance.text,
          normalizedStatement: utterance.text,
          speaker: utterance.speaker,
          topicId: utterance.topicId ?? "general",
          type,
          timestamp: utterance.timestamp,
          utteranceId: utterance.utteranceId,
          embedding: [0],
          extractedData: {
            deadline: tier2.classification.extractedData.deadline,
            quantity: tier2.classification.extractedData.quantity,
            scope: tier2.classification.extractedData.scope
              ? [tier2.classification.extractedData.scope]
              : undefined,
            amount: tier2.classification.extractedData.amount,
            currency: tier2.classification.extractedData.currency,
          },
        });
      } catch (error) {
        log.warn(
          { err: error, utteranceId: utterance.utteranceId },
          "Commitment write failed in tier2"
        );
      }
    }

    return tier2;
  }

  private async ensureSessionHydrated(sessionId: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing?.hydrated) {
      return;
    }

    await this.constraintManager.ensureHydrated(sessionId);
    await this.commitmentManager.hydrateSession(sessionId);

    const payload = await this.getContextPayload(sessionId);
    this.tier1.seedContext(sessionId, payload);

    this.sessions.set(sessionId, { hydrated: true });
    log.info({ sessionId }, "Pipeline session hydrated");
  }
}

export function getTopicLabelById(
  topics: TopicState[],
  topicId: string | undefined
): string | undefined {
  if (!topicId) {
    return undefined;
  }

  return topics.find((topic) => topic.topicId === topicId)?.label;
}
