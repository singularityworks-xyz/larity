import type { Alert } from "../alerts/types";
import type { Commitment } from "../commitment/types";
import type { Constraint, PreloadedContextPayload } from "../constraint/types";
import { createMeetingModeLogger } from "../logger";
import type { TopicState } from "../topic/types";
import type { Utterance } from "../utterance/types";
import { PreFilter } from "./pre-filter";
import { Tier1StructuralDetector } from "./tier1";
import { Tier2Classifier } from "./tier2";
import { Tier3SearchEngine } from "./tier3";
import type { Tier4DeepReasoner } from "./tier4";
import { buildAlertFromTier4Response } from "./tier4-alert";
import { assembleTier4Context } from "./tier4-context";
import type {
  Tier1Result,
  Tier2Classification,
  Tier2Input,
  Tier3Result,
  Tier4Response,
} from "./types";

const log = createMeetingModeLogger("pipeline-engine");

const PERF = {
  now: () => performance.now(),
};

export interface Tier4AlertsPublisher {
  publish(sessionId: string, alert: Alert): Promise<void>;
}

interface PipelineFinalizerAdapter {
  getRecentSameSpeakerText(
    sessionId: string,
    speakerId: string,
    currentUtteranceId?: string,
    limit?: number
  ): string[];
  getRecentEmbeddings(sessionId: string, limit?: number): number[][];
  getRecentUtterancesChronological(
    sessionId: string,
    options?: { excludeUtteranceId?: string; limit?: number }
  ): Utterance[];
  applyTier2TopicDelta(
    sessionId: string,
    topicId: string | undefined,
    delta: NonNullable<Tier2Classification["topicDelta"]>
  ): Promise<void>;
}

interface ConstraintManagerAdapter {
  ensureHydrated(sessionId: string): Promise<void>;
  processUtterance(utterance: Utterance): Promise<unknown>;
  getAll(sessionId: string): Constraint[];
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
  search(
    sessionId: string,
    embedding: number[],
    options?: { limit?: number; threshold?: number }
  ): Array<{ id: string; score: number }>;
  getAll(sessionId: string): Commitment[];
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
  tier4?: Tier4DeepReasoner;
  tier4Alerts?: Tier4AlertsPublisher;
}

export interface Tier4EvaluationSummary {
  invoked: boolean;
  surfaced?: boolean;
  latencyMs?: number;
}

export interface PipelineEvaluationResult {
  dropped: boolean;
  dropReason?: string;
  tier1?: Tier1Result;
  tier2?: Tier2Classification;
  /** Mirrors Tier 2 classifier `shouldStopForDeepReasoning` (shown in traces / QA) */
  tier2StopDeepReasoning?: boolean;
  tier3?: Tier3Result;
  /** Raw Tier 4 model output — **omit** downstream / logs for privacy unless required */
  tier4Response?: Tier4Response | null;
  tier4Outcome?: Tier4EvaluationSummary;
  runTier4: boolean;
  latencies: {
    preFilterMs: number;
    tier1Ms?: number;
    tier2Ms?: number;
    gateMs?: number;
    tier4Ms?: number;
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
  private readonly tier3: Tier3SearchEngine;
  private readonly sessions = new Map<string, SessionPipelineState>();

  private readonly finalizer: PipelineFinalizerAdapter;
  private readonly constraintManager: ConstraintManagerAdapter;
  private readonly commitmentManager: CommitmentManagerAdapter;
  private readonly getContextPayload: PipelineEngineDependencies["getContextPayload"];
  private readonly getCurrentTopicLabel: NonNullable<
    PipelineEngineDependencies["getCurrentTopicLabel"]
  >;
  private readonly tier4?: Tier4DeepReasoner;
  private readonly tier4Alerts?: Tier4AlertsPublisher;

  constructor(deps: PipelineEngineDependencies) {
    this.preFilter = deps.preFilter ?? new PreFilter();
    this.tier1 = deps.tier1 ?? new Tier1StructuralDetector();
    this.tier2 = deps.tier2 ?? new Tier2Classifier();
    this.tier3 = new Tier3SearchEngine();
    this.finalizer = deps.finalizer;
    this.constraintManager = deps.constraintManager;
    this.commitmentManager = deps.commitmentManager;
    this.getContextPayload = deps.getContextPayload;
    this.getCurrentTopicLabel =
      deps.getCurrentTopicLabel ?? (async () => undefined);
    this.tier4 = deps.tier4;
    this.tier4Alerts = deps.tier4Alerts;
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
        runTier4: false,
        tier4Outcome: { invoked: false },
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

    const payload = await this.getContextPayload(utterance.sessionId);
    const recentEmbeddings = this.finalizer.getRecentEmbeddings(
      utterance.sessionId,
      10
    );
    const tier3Task = this.tier3.evaluate(
      utterance,
      payload,
      this.commitmentManager,
      recentEmbeddings
    );

    const [tier1, tier2, tier3] = await Promise.all([
      tier1Task,
      tier2Task,
      tier3Task,
    ]);
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

    // Respect Tier 2 "low-value / filler" gate for the whole Tier 4 call: Tier 3
    // ledger/memory hits can otherwise force Tier 4 on every greeting when embeddings
    // loosely match hydrated commitments — wasteful and breaks the tiered design.
    const runTier4 =
      !tier2.shouldStopForDeepReasoning && (highSignal || tier3.forceTier4);
    const gateMs = PERF.now() - gateStart;

    const { tier4Response, tier4Outcome, tier4Ms } =
      await this.evaluateTier4AfterGate({
        utterance,
        runTier4,
        tier1,
        tier2Classification: tier2.classification,
        tier3,
        payload,
      });

    return {
      dropped: false,
      tier1,
      tier2: tier2.classification,
      tier2StopDeepReasoning: tier2.shouldStopForDeepReasoning,
      tier3,
      tier4Response,
      tier4Outcome,
      runTier4,
      latencies: {
        preFilterMs,
        tier1Ms,
        tier2Ms,
        gateMs,
        tier4Ms,
        pipelineBudgetMs: PERF.now() - start,
      },
    };
  }

  private async evaluateTier4AfterGate(params: {
    utterance: Utterance;
    runTier4: boolean;
    tier1: Tier1Result;
    tier2Classification: Tier2Classification;
    tier3: Tier3Result;
    payload: PreloadedContextPayload | null;
  }): Promise<{
    tier4Response: Tier4Response | null;
    tier4Outcome: Tier4EvaluationSummary;
    tier4Ms?: number;
  }> {
    const { utterance, runTier4, tier1, tier2Classification, tier3, payload } =
      params;

    if (!runTier4) {
      return {
        tier4Response: null,
        tier4Outcome: { invoked: false },
      };
    }

    const tier4 = this.tier4;
    const tier4Alerts = this.tier4Alerts;
    if (!(tier4 && tier4Alerts)) {
      log.debug(
        { sessionId: utterance.sessionId, utteranceId: utterance.utteranceId },
        "Tier4 gated positive but Tier4 deps missing; skipping silently"
      );
      return {
        tier4Response: null,
        tier4Outcome: { invoked: false, surfaced: false },
      };
    }

    const topicSummaryRaw = await this.getCurrentTopicLabel(
      utterance.sessionId,
      utterance.topicId
    );
    const topicSummary =
      typeof topicSummaryRaw === "string" ? topicSummaryRaw : "";

    const recentUtterances = this.finalizer.getRecentUtterancesChronological(
      utterance.sessionId,
      { excludeUtteranceId: utterance.utteranceId, limit: 48 }
    );

    const tier4Ctx = assembleTier4Context({
      utterance,
      topicSummary,
      tier1,
      tier2: tier2Classification,
      tier3,
      payload,
      recentUtterances,
      allCommitments: this.commitmentManager.getAll(utterance.sessionId),
      allConstraints: this.constraintManager.getAll(utterance.sessionId),
    });

    const tier4WallStart = PERF.now();
    const tier4Response = await tier4.reason(tier4Ctx);
    const tier4Ms = PERF.now() - tier4WallStart;

    let tier4Surfaced = false;
    if (tier4Response) {
      const alert = buildAlertFromTier4Response({
        response: tier4Response,
        triggerUtteranceId: utterance.utteranceId,
        speaker: utterance.speaker,
        topicId: utterance.topicId,
      });

      if (alert) {
        try {
          await tier4Alerts.publish(utterance.sessionId, alert);
          tier4Surfaced = true;
        } catch (error) {
          log.warn(
            { err: error, utteranceId: utterance.utteranceId },
            "Tier4 alert publishing failed silently"
          );
        }
      }
    }

    return {
      tier4Response,
      tier4Outcome: {
        invoked: true,
        surfaced: tier4Surfaced,
        latencyMs: tier4Ms,
      },
      tier4Ms,
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
          embedding: utterance.embedding ?? [0],
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
