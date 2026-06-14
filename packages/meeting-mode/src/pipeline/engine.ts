import type { Alert } from "../alerts/types";
import { createAlert } from "../alerts/types";
import type { Commitment } from "../commitment/types";
import type { Constraint, PreloadedContextPayload } from "../constraint/types";
import { CostManager } from "../cost/manager";
import { GEMINI_TIER4_MODEL, SAMBANOVA_TIER2_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import { SpeakerStateTracker } from "../speaker-state/tracker";
import type { SpeakerStateAlert } from "../speaker-state/types";
import { PredictivePreloader } from "../speculative/predictive-preloader";
import { SpeculativeProcessor } from "../speculative/processor";
import type { PartialUtterance } from "../speculative/types";
import {
  getSpeakerProcessingPriority,
  SPEAKER_AWARE_TIER4_CONFIDENCE,
} from "../speculative/types";
import type { TopicState } from "../topic/types";
import type { Utterance } from "../utterance/types";
import {
  pipelineContextPayloadCacheHitsTotal,
  pipelineContextPayloadCacheMissesTotal,
  pipelineDroppedTotal,
  pipelineGateDuration,
  pipelinePrefilterDuration,
  pipelineSessionCostDollars,
  pipelineSpeculativeDiscardsTotal,
  pipelineSpeculativeHitsTotal,
  pipelineTier1Duration,
  pipelineTier2CacheHitsTotal,
  pipelineTier2CacheMissesTotal,
  pipelineTier2Duration,
  pipelineTier3Duration,
  pipelineTier4Duration,
  pipelineTier4InvokedTotal,
  pipelineTier4SuppressedTotal,
  pipelineTotalDuration,
} from "./metrics";
import { PreFilter, type PreFilterDecision } from "./pre-filter";
import { Tier1StructuralDetector, textMatchesTier1PricingPath } from "./tier1";
import { Tier2Classifier } from "./tier2";
import { Tier2SemanticCache } from "./tier2-cache";
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
    options?: { k?: number; minSimilarity?: number }
  ): Array<{ commitment: { id: string }; similarity: number }>;
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
  getTopics?: (sessionId: string) => TopicState[];
  getAgendaItems?: (sessionId: string) => string[];
  getKnownClientMembers?: (
    sessionId: string
  ) => Promise<Array<{ id: string; name: string }>>;
  preFilter?: PreFilter;
  tier1?: Tier1StructuralDetector;
  tier2?: Tier2Classifier;
  tier4?: Tier4DeepReasoner;
  tier4Alerts?: Tier4AlertsPublisher;
  tier2Cache?: Tier2SemanticCache;
  costManager?: CostManager;
  speakerStateTracker?: SpeakerStateTracker;
  onSpeakerIdentityGuessed?: (
    sessionId: string,
    index: string,
    memberId: string
  ) => void;
  onUtteranceRetracted?: (sessionId: string, utteranceId: string) => void;
  speculativeProcessor?: SpeculativeProcessor;
  predictivePreloader?: PredictivePreloader;
  /** Hook after pipeline session teardown (e.g. clear session-scoped alert publishers) */
  onPipelineSessionClosed?: (sessionId: string) => void;
}

export interface Tier4EvaluationSummary {
  invoked: boolean;
  surfaced?: boolean;
  latencyMs?: number;
}

export interface PipelineEvaluationResult {
  dropped: boolean;
  dropReason?: string;
  retractUtteranceId?: string;
  tier1?: Tier1Result;
  tier2?: Tier2Classification;
  /** Mirrors Tier 2 classifier `shouldStopForDeepReasoning` (shown in traces / QA) */
  tier2StopDeepReasoning?: boolean;
  tier3?: Tier3Result;
  /** Raw Tier 4 model output — **omit** downstream / logs for privacy unless required */
  tier4Response?: Tier4Response | null;
  tier4Outcome?: Tier4EvaluationSummary;
  runTier4: boolean;
  tier2CacheHit?: boolean;
  speculativeHit?: boolean;
  speculativeMismatchRatio?: number;
  speakerPriority?: "high" | "standard" | "low";
  sessionCost?: number;
  latencies: {
    preFilterMs: number;
    tier1Ms?: number;
    tier2Ms?: number;
    gateMs?: number;
    tier4Ms?: number;
    pipelineBudgetMs: number;
  };
}

interface SessionPipelineState {
  hydrated: boolean;
  contextPayload: PreloadedContextPayload | null;
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
  private readonly tier2Cache: Tier2SemanticCache;
  private readonly costManager: CostManager;
  private readonly speakerStateTracker: SpeakerStateTracker;
  private readonly getTopics: NonNullable<
    PipelineEngineDependencies["getTopics"]
  >;
  private readonly getAgendaItems: NonNullable<
    PipelineEngineDependencies["getAgendaItems"]
  >;
  private readonly getKnownClientMembers: NonNullable<
    PipelineEngineDependencies["getKnownClientMembers"]
  >;
  private readonly onSpeakerIdentityGuessed?: PipelineEngineDependencies["onSpeakerIdentityGuessed"];
  private readonly onUtteranceRetracted?: PipelineEngineDependencies["onUtteranceRetracted"];
  private readonly speculativeProcessor: SpeculativeProcessor;
  private readonly predictivePreloader: PredictivePreloader;
  private readonly onPipelineSessionClosed?: (sessionId: string) => void;
  private readonly evaluationChains = new Map<string, Promise<unknown>>();

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
    this.tier2Cache = deps.tier2Cache ?? new Tier2SemanticCache();
    this.costManager = deps.costManager ?? new CostManager();
    this.speakerStateTracker =
      deps.speakerStateTracker ?? new SpeakerStateTracker();
    this.getTopics = deps.getTopics ?? (() => []);
    this.getAgendaItems = deps.getAgendaItems ?? (() => []);
    this.getKnownClientMembers = deps.getKnownClientMembers ?? (async () => []);
    this.onSpeakerIdentityGuessed = deps.onSpeakerIdentityGuessed;
    this.onUtteranceRetracted = deps.onUtteranceRetracted;
    this.speculativeProcessor =
      deps.speculativeProcessor ??
      new SpeculativeProcessor({
        tier1: this.tier1,
        tier2: this.tier2,
        costManager: this.costManager,
        getRecentSameSpeakerText: (sid, spkId, limit) =>
          this.finalizer.getRecentSameSpeakerText(sid, spkId, undefined, limit),
        getCurrentTopicLabel: (sid, topicId) =>
          this.getCurrentTopicLabel(sid, topicId),
      });
    this.predictivePreloader =
      deps.predictivePreloader ?? new PredictivePreloader();
    this.onPipelineSessionClosed = deps.onPipelineSessionClosed;
  }

  /**
   * Queue pipeline evaluation per session so callers (e.g. utterance publish) are not
   * blocked on LLM latency, while keeping strict FIFO ordering within a session.
   */
  evaluateUtteranceQueued(
    utterance: Utterance,
    afterEvaluate?: (
      utterance: Utterance,
      result: PipelineEvaluationResult
    ) => Promise<void>
  ): void {
    const sessionId = utterance.sessionId;
    const previous = this.evaluationChains.get(sessionId) ?? Promise.resolve();
    const evaluated = previous.then(() => this.evaluateUtterance(utterance));
    const next = afterEvaluate
      ? evaluated.then((result) => afterEvaluate(utterance, result))
      : evaluated;

    const recovered = next.catch((error) => {
      log.warn(
        { err: error, utteranceId: utterance.utteranceId, sessionId },
        "Queued pipeline evaluation failed"
      );
    });

    this.evaluationChains.set(sessionId, recovered);
  }

  private runPreFilter(
    utterance: Utterance
  ): PreFilterDecision & { preFilterMs: number } {
    const preFilterStart = PERF.now();
    const decision = this.preFilter.evaluate(utterance);
    const preFilterMs = PERF.now() - preFilterStart;

    pipelinePrefilterDuration.observe(preFilterMs);

    if (decision.retractUtteranceId && this.onUtteranceRetracted) {
      this.onUtteranceRetracted(
        utterance.sessionId,
        decision.retractUtteranceId
      );
    }

    return {
      ...decision,
      preFilterMs,
    };
  }

  async evaluateUtterance(
    utterance: Utterance
  ): Promise<PipelineEvaluationResult> {
    const start = PERF.now();
    await this.ensureSessionHydrated(utterance.sessionId);
    await this.ensureUtteranceEmbedding(utterance);

    pipelineContextPayloadCacheHitsTotal.inc();
    const payload =
      this.sessions.get(utterance.sessionId)?.contextPayload ?? null;

    const speakerPriority = getSpeakerProcessingPriority(utterance.speaker);

    const preFilterResult = this.runPreFilter(utterance);

    if (preFilterResult.dropped) {
      pipelineDroppedTotal.inc({ reason: preFilterResult.reason ?? "unknown" });
      pipelineTotalDuration.observe(PERF.now() - start);
      return {
        dropped: true,
        dropReason: preFilterResult.reason,
        retractUtteranceId: preFilterResult.retractUtteranceId,
        runTier4: false,
        tier4Outcome: { invoked: false },
        speakerPriority,
        latencies: {
          preFilterMs: preFilterResult.preFilterMs,
          pipelineBudgetMs: PERF.now() - start,
        },
      };
    }

    // --- Speculative cache lookup ---
    const speculativeMatch = this.speculativeProcessor.matchSpeculation(
      utterance.sessionId,
      utterance.text
    );
    const speculativeHit = speculativeMatch.matched;
    const speculativeMismatchRatio = speculativeMatch.mismatchRatio;

    if (speculativeHit) {
      pipelineSpeculativeHitsTotal.inc();
      log.info(
        {
          sessionId: utterance.sessionId,
          utteranceId: utterance.utteranceId,
          mismatchRatio: speculativeMismatchRatio,
        },
        "Speculative cache hit — using pre-computed Tier 2 classification"
      );
    } else if (speculativeMismatchRatio < 1) {
      pipelineSpeculativeDiscardsTotal.inc();
    }

    // --- Predictive constraint preloading ---
    const predictedTopics = this.predictivePreloader.predictTopics(
      utterance.text
    );
    if (predictedTopics.length > 0) {
      this.predictivePreloader.prefetch(utterance.sessionId, predictedTopics);
    }

    // --- Run Tier 1 always (structural detection is free) ---
    const tier1Start = PERF.now();
    const tier1Task = Promise.resolve(this.tier1.detect(utterance));

    // --- Tier 2: use speculative result if hit, otherwise run LLM ---
    const tier2Start = PERF.now();
    const tier2Task =
      speculativeHit && speculativeMatch.result
        ? Promise.resolve({
            classification: speculativeMatch.result.classification,
            shouldStopForDeepReasoning: false,
            tier2CacheHit: false,
            speculativeHit: true,
          })
        : this.runTier2(utterance).then((r) => ({
            ...r,
            speculativeHit: false,
          }));

    const recentEmbeddings = this.finalizer.getRecentEmbeddings(
      utterance.sessionId,
      10
    );
    const tier3Start = PERF.now();
    const tier3Task = this.tier3.evaluate(
      utterance,
      payload,
      this.commitmentManager,
      recentEmbeddings
    );

    const constraintTask = this.constraintManager
      .processUtterance(utterance)
      .catch((error) => {
        log.warn(
          { err: error, utteranceId: utterance.utteranceId },
          "Constraint processing failed in pipeline"
        );
        return undefined;
      });

    const [tier1, tier2, tier3, _constraintOutcome] = await Promise.all([
      tier1Task,
      tier2Task,
      tier3Task,
      constraintTask,
    ]);
    // --- Apply Tier 2 side effects that runTier2 would normally handle,
    //     when the classification came from a speculative cache hit ---
    if (speculativeHit && speculativeMatch.result) {
      await this.applyTier2SideEffects(
        utterance,
        speculativeMatch.result.classification
      );
    }

    const tier2Ms = PERF.now() - tier2Start;
    const tier1Ms = PERF.now() - tier1Start;

    pipelineTier1Duration.observe(tier1Ms);
    pipelineTier2Duration.observe(tier2Ms);
    pipelineTier3Duration.observe(PERF.now() - tier3Start);

    if (tier2.tier2CacheHit) {
      pipelineTier2CacheHitsTotal.inc();
    } else if (!speculativeHit) {
      pipelineTier2CacheMissesTotal.inc();
    }

    this.speakerStateTracker.ingest(
      utterance.sessionId,
      utterance,
      tier2.classification
    );

    await this.publishSpeakerStateAlerts(utterance, tier2.classification);

    const gateStart = PERF.now();
    const highSignal = this.isHighSignal(tier1, tier2.classification);

    // Respect Tier 2 "low-value / filler" gate for the whole Tier 4 call: Tier 3
    // ledger/memory hits can otherwise force Tier 4 on every greeting when embeddings
    // loosely match hydrated commitments — wasteful and breaks the tiered design.
    // Structural Tier 1 hits (API keys, passwords, pricing, blocklist) override the
    // stop — they always need Tier 4 reasoning regardless of Tier 2 classification.
    let runTier4 =
      this.tier4PassesStructuralOverride(
        tier1,
        tier2.shouldStopForDeepReasoning
      ) &&
      (highSignal || tier3.forceTier4);

    // --- Speaker-aware Tier 4 gate ---
    runTier4 = this.applySpeakerAwareGate(
      runTier4,
      speakerPriority,
      tier1,
      tier2.classification
    );

    // --- Cost cap gates ---
    const sessionCost = await this.costManager.getSessionCost(
      utterance.sessionId
    );

    const { runTier4: gatedTier4, suppressReason: tier4SuppressReason } =
      this.applyCostGates(
        runTier4,
        utterance.sessionId,
        sessionCost,
        tier1,
        tier2.classification
      );
    runTier4 = gatedTier4;

    const gateMs = PERF.now() - gateStart;
    pipelineGateDuration.observe(gateMs);

    if (!runTier4 && tier4SuppressReason) {
      pipelineTier4SuppressedTotal.inc({ reason: tier4SuppressReason });
    }

    const { tier4Response, tier4Outcome, tier4Ms } =
      await this.evaluateTier4AfterGate({
        utterance,
        runTier4,
        tier1,
        tier2Classification: tier2.classification,
        tier3,
        payload,
      });

    if (runTier4) {
      pipelineTier4Duration.observe(tier4Ms ?? 0);
      pipelineTier4InvokedTotal.inc({
        surfaced: tier4Outcome?.surfaced ? "true" : "false",
      });
    }

    const totalMs = PERF.now() - start;
    pipelineTotalDuration.observe(totalMs);

    pipelineSessionCostDollars.set(
      { session_id: utterance.sessionId },
      sessionCost
    );

    return {
      dropped: false,
      retractUtteranceId: preFilterResult.retractUtteranceId,
      tier1,
      tier2: tier2.classification,
      tier2StopDeepReasoning: tier2.shouldStopForDeepReasoning,
      tier3,
      tier4Response,
      tier4Outcome,
      runTier4,
      tier2CacheHit: tier2.tier2CacheHit,
      speculativeHit,
      speculativeMismatchRatio,
      speakerPriority,
      sessionCost,
      latencies: {
        preFilterMs: preFilterResult.preFilterMs,
        tier1Ms,
        tier2Ms,
        gateMs,
        tier4Ms,
        pipelineBudgetMs: totalMs,
      },
    };
  }

  private isHighSignal(
    tier1: Tier1Result,
    tier2Classification: Tier2Classification
  ): boolean {
    return (
      tier1.blocklistHit ||
      tier1.technicalHit ||
      tier1.pricingHit ||
      tier2Classification.intent === "commitment" ||
      tier2Classification.intent === "decision" ||
      tier2Classification.intent === "concern" ||
      tier2Classification.riskSignals.length > 0
    );
  }

  /**
   * Structural Tier 1 hits (API key, password, pricing, blocklist) override
   * Tier 2's "stop deep reasoning" signal. An API key leaked in casual filler
   * should still reach Tier 4 for information_risk assessment.
   */
  private tier4PassesStructuralOverride(
    tier1: Tier1Result,
    shouldStop: boolean
  ): boolean {
    if (!shouldStop) {
      return true;
    }
    return tier1.technicalHit || tier1.blocklistHit || tier1.pricingHit;
  }

  private applySpeakerAwareGate(
    runTier4: boolean,
    speakerPriority: "high" | "standard" | "low",
    tier1: Tier1Result,
    tier2Classification: Tier2Classification
  ): boolean {
    if (!runTier4 || speakerPriority !== "low") {
      return runTier4;
    }

    if (tier1.blocklistHit || tier1.technicalHit) {
      return true;
    }

    const threshold = SPEAKER_AWARE_TIER4_CONFIDENCE[speakerPriority];
    if (tier2Classification.confidence < threshold) {
      log.debug(
        {
          speakerPriority,
          confidence: tier2Classification.confidence,
          threshold,
        },
        "Speaker-aware gate: Tier 4 suppressed for low-priority speaker"
      );
      return false;
    }

    return true;
  }

  private applyCostGates(
    runTier4: boolean,
    sessionId: string,
    sessionCost: number,
    tier1: Tier1Result,
    tier2Classification: Tier2Classification
  ): { runTier4: boolean; suppressReason: string | undefined } {
    if (this.costManager.isHardCapReached(sessionCost)) {
      log.info(
        { sessionId, sessionCost, limit: 2.0 },
        "Cost hard cap reached — Tier 4 disabled"
      );
      return { runTier4: false, suppressReason: "cost_hard_cap" };
    }

    if (
      this.costManager.isWarningMode(sessionCost) &&
      runTier4 &&
      !tier1.blocklistHit &&
      !tier1.technicalHit &&
      !tier1.pricingHit &&
      tier2Classification.riskSignals.length === 0
    ) {
      log.info(
        { sessionId, sessionCost, threshold: 1.6 },
        "Cost warning mode — Tier 4 suppressed (no risk signals)"
      );
      return { runTier4: false, suppressReason: "cost_warning" };
    }

    return { runTier4, suppressReason: undefined };
  }

  async evaluatePartial(partial: PartialUtterance): Promise<void> {
    await this.ensureSessionHydrated(partial.sessionId);

    this.speculativeProcessor.processPartial(partial);

    const topics = this.predictivePreloader.predictTopics(partial.text);
    if (topics.length > 0) {
      this.predictivePreloader.prefetch(partial.sessionId, topics);
    }
  }

  private async publishSpeakerStateAlerts(
    utterance: Utterance,
    tier2Classification: Tier2Classification
  ): Promise<void> {
    const alerts = this.speakerStateTracker.checkAlerts(
      utterance.sessionId,
      utterance,
      tier2Classification,
      this.getTopics(utterance.sessionId),
      this.getAgendaItems(utterance.sessionId),
      false
    );

    if (alerts.length === 0 || !this.tier4Alerts) {
      return;
    }

    const publisher = this.tier4Alerts;

    await Promise.all(
      alerts.map(async (ssAlert) => {
        try {
          await publisher.publish(
            utterance.sessionId,
            speakerStateAlertToAlert(ssAlert, utterance)
          );
        } catch (error) {
          log.warn(
            { err: error, utteranceId: utterance.utteranceId },
            "Speaker state alert publishing failed"
          );
        }
      })
    );
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
    if (!tier4) {
      log.debug(
        { sessionId: utterance.sessionId, utteranceId: utterance.utteranceId },
        "Tier4 gated positive but Tier4 missing; skipping silently"
      );
      return {
        tier4Response: null,
        tier4Outcome: { invoked: false, surfaced: false },
      };
    }

    let tier4Response: Tier4Response | null = null;
    let tier4Ms = 0;

    try {
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
        speakerStates: this.speakerStateTracker.getSummaries(
          utterance.sessionId
        ),
      });

      const tier4WallStart = PERF.now();
      const tier4Result = await tier4.reason(tier4Ctx);
      tier4Ms = PERF.now() - tier4WallStart;
      tier4Response = tier4Result.response;

      if (tier4Result.promptTokens > 0 || tier4Result.completionTokens > 0) {
        this.costManager
          .recordCost(
            utterance.sessionId,
            tier4Result.promptTokens,
            tier4Result.completionTokens,
            GEMINI_TIER4_MODEL
          )
          .catch((err) =>
            log.warn(
              { err, utteranceId: utterance.utteranceId },
              "Tier4 cost recording failed"
            )
          );
      }
    } catch (error) {
      log.warn(
        { err: error, utteranceId: utterance.utteranceId },
        "Tier4 reasoning sequence failed silently"
      );
      tier4Response = null;
    }

    let tier4Surfaced = false;
    if (tier4Response && tier4Alerts) {
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
    } else if (tier4Response && !tier4Alerts) {
      log.debug(
        { utteranceId: utterance.utteranceId },
        "Tier4 response available but tier4Alerts publisher missing"
      );
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
    this.tier2Cache.closeSession(sessionId);
    this.speakerStateTracker.closeSession(sessionId);
    this.evaluationChains.delete(sessionId);
    this.speculativeProcessor.closeSession(sessionId);
    this.predictivePreloader.closeSession(sessionId);
    this.sessions.delete(sessionId);
    // Clean up per-session Prometheus gauge to prevent unbounded memory growth
    pipelineSessionCostDollars.remove({ session_id: sessionId });
    this.onPipelineSessionClosed?.(sessionId);
  }

  closeAll(): void {
    this.preFilter.closeAll();
    this.tier1.closeAll();
    this.tier2Cache.closeAll();
    this.speakerStateTracker.closeAll();
    this.evaluationChains.clear();
    this.speculativeProcessor.closeAll();
    this.predictivePreloader.closeAll();
    this.sessions.clear();
  }

  private async applyTier2SideEffects(
    utterance: Utterance,
    classification: Tier2Classification
  ): Promise<void> {
    const { sessionId, text, embedding, topicId } = utterance;

    if (embedding && embedding.length > 0) {
      this.tier2Cache.set(sessionId, embedding, text, classification);
    }

    if (classification.topicDelta && topicId) {
      await this.finalizer.applyTier2TopicDelta(
        sessionId,
        topicId,
        classification.topicDelta
      );
    }

    await this.maybeWriteCommitment(utterance, embedding, { classification });
  }

  private async runTier2(utterance: Utterance): Promise<{
    classification: Tier2Classification;
    shouldStopForDeepReasoning: boolean;
    tier2CacheHit?: boolean;
  }> {
    const { embedding, sessionId, text } = utterance;

    // Check semantic cache before LLM
    if (embedding && embedding.length > 0) {
      const cached = this.tier2Cache.get(sessionId, embedding, text);
      if (cached) {
        log.info(
          { sessionId, utteranceId: utterance.utteranceId },
          "Tier2 cache hit — skipping LLM invocation"
        );
        if (cached.topicDelta && utterance.topicId) {
          await this.finalizer.applyTier2TopicDelta(
            sessionId,
            utterance.topicId,
            cached.topicDelta
          );
        }
        return {
          classification: cached,
          shouldStopForDeepReasoning: false,
          tier2CacheHit: true,
        };
      }
    }

    const recentSameSpeaker = this.finalizer.getRecentSameSpeakerText(
      sessionId,
      utterance.speaker.speakerId,
      utterance.utteranceId,
      3
    );

    const topicLabel = await this.getCurrentTopicLabel(
      sessionId,
      utterance.topicId
    );

    let knownClientMembers: Array<{ id: string; name: string }> = [];
    try {
      knownClientMembers = await this.getKnownClientMembers(sessionId);
    } catch (error) {
      log.warn(
        { err: error, sessionId, utteranceId: utterance.utteranceId },
        "Known client members lookup failed; proceeding without candidates"
      );
    }

    const input: Tier2Input = {
      utterance: text,
      speaker: utterance.speaker,
      recentSameSpeaker,
      topicLabel,
      structuralPricingCue: textMatchesTier1PricingPath(text),
      knownClientMembers,
    };

    const tier2 = await this.tier2.classify(input);

    // Record Tier2 cost
    if (
      (tier2.promptTokens && tier2.promptTokens > 0) ||
      (tier2.completionTokens && tier2.completionTokens > 0)
    ) {
      this.costManager
        .recordCost(
          sessionId,
          tier2.promptTokens || 0,
          tier2.completionTokens || 0,
          SAMBANOVA_TIER2_MODEL
        )
        .catch((err) =>
          log.warn(
            { err, utteranceId: utterance.utteranceId },
            "Tier2 cost recording failed"
          )
        );
    }

    await this.applyTier2SideEffects(utterance, tier2.classification);

    if (tier2.classification.identityGuess && this.onSpeakerIdentityGuessed) {
      try {
        this.onSpeakerIdentityGuessed(
          sessionId,
          tier2.classification.identityGuess.index,
          tier2.classification.identityGuess.memberId
        );
      } catch (error) {
        log.warn(
          {
            err: error,
            sessionId,
            index: tier2.classification.identityGuess.index,
            memberId: tier2.classification.identityGuess.memberId,
          },
          "onSpeakerIdentityGuessed hook failed"
        );
      }
    }

    return { ...tier2, tier2CacheHit: false };
  }

  private async maybeWriteCommitment(
    utterance: Utterance,
    embedding: number[] | undefined,
    tier2: { classification: Tier2Classification }
  ): Promise<void> {
    if (
      tier2.classification.intent !== "commitment" &&
      tier2.classification.intent !== "decision"
    ) {
      return;
    }

    // Skip persisting commitments without embeddings to avoid false similarity matches
    if (!embedding || embedding.length === 0) {
      log.debug(
        { utteranceId: utterance.utteranceId },
        "Skipping commitment write: no embedding available"
      );
      return;
    }

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
        embedding,
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

  private async ensureSessionHydrated(sessionId: string): Promise<void> {
    const existing = this.sessions.get(sessionId);
    if (existing?.hydrated) {
      return;
    }

    await this.constraintManager.ensureHydrated(sessionId);
    await this.commitmentManager.hydrateSession(sessionId);

    pipelineContextPayloadCacheMissesTotal.inc();
    const payload = await this.getContextPayload(sessionId);
    this.tier1.seedContext(sessionId, payload);

    await this.costManager.primeSessionCost(sessionId);

    if (payload) {
      this.predictivePreloader.seedFromContext(sessionId, payload);
    }

    this.sessions.set(sessionId, {
      hydrated: true,
      contextPayload: payload,
    });
    log.info({ sessionId }, "Pipeline session hydrated");
  }

  private async ensureUtteranceEmbedding(utterance: Utterance): Promise<void> {
    if (utterance.embedding && utterance.embedding.length > 0) {
      return;
    }
    if (!utterance.embeddingPromise) {
      return;
    }

    try {
      const resolved = await utterance.embeddingPromise;
      if (resolved && resolved.length > 0) {
        utterance.embedding = resolved;
      }
    } catch {
      /* tiers tolerate missing embeddings */
    } finally {
      utterance.embeddingPromise = undefined;
    }
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

function speakerStateAlertToAlert(
  ssAlert: SpeakerStateAlert,
  utterance: Utterance
): Alert {
  return createAlert({
    category: ssAlert.category,
    severity: ssAlert.severity,
    speaker: utterance.speaker,
    triggerUtteranceId: utterance.utteranceId,
    topicId: ssAlert.topicId ?? utterance.topicId ?? "",
    title: ssAlert.message,
    message: ssAlert.surfaceReason,
    suggestion: ssAlert.suggestion,
    routing: "shared",
    confidence: ssAlert.confidence,
    triggerTier: 2,
  });
}
