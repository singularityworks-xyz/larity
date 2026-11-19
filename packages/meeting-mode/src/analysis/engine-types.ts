import type { Alert } from "../alerts/types";
import type { Commitment } from "../commitment/types";
import type { Constraint, PreloadedContextPayload } from "../constraint/types";
import type { CostManager } from "../cost/manager";
import type { TopicState } from "../topic/types";
import type { Utterance } from "../transcript/utterances/types";
import type { LiveAnalyzer } from "./live/live-analyzer";
import type { PreFilter } from "./pre-filter";
import type { SpeakerStateTracker } from "./speaker-state/tracker";
import type { PredictivePreloader } from "./speculative/predictive-preloader";
import type { SpeculativeProcessor } from "./speculative/processor";
import type { Tier1StructuralDetector } from "./tiers/tier1/tier1";
import type { Tier2Classifier } from "./tiers/tier2/tier2";
import type { Tier2SemanticCache } from "./tiers/tier2/tier2-cache";
import type { Tier3SearchEngine } from "./tiers/tier3/tier3";
import type { Tier4DeepReasoner } from "./tiers/tier4/tier4";
import type {
  Tier1Result,
  Tier2Classification,
  Tier3Result,
  Tier4Response,
} from "./types";

export interface Tier4AlertsPublisher {
  publish(sessionId: string, alert: Alert): Promise<void>;
}

export interface PipelineFinalizerAdapter {
  applyTier2TopicDelta(
    sessionId: string,
    topicId: string | undefined,
    delta: NonNullable<Tier2Classification["topicDelta"]>
  ): Promise<void>;
  getRecentEmbeddings(sessionId: string, limit?: number): number[][];
  getRecentSameSpeakerText(
    sessionId: string,
    speakerId: string,
    currentUtteranceId?: string,
    limit?: number
  ): string[];
  getRecentUtterancesChronological(
    sessionId: string,
    options?: { excludeUtteranceId?: string; limit?: number }
  ): Utterance[];
}

export interface ConstraintManagerAdapter {
  ensureHydrated(
    sessionId: string,
    contextPayload?: PreloadedContextPayload | null
  ): Promise<void>;
  getAll(sessionId: string): Constraint[];
  processUtterance(utterance: Utterance): Promise<unknown>;
}

export interface CommitmentManagerAdapter {
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
  getAll(sessionId: string): Commitment[];
  hydrateSession(sessionId: string): Promise<unknown>;
  search(
    sessionId: string,
    embedding: number[],
    options?: { k?: number; minSimilarity?: number }
  ): Array<{ commitment: { id: string }; similarity: number }>;
}

export interface PipelineEngineDependencies {
  commitmentManager: CommitmentManagerAdapter;
  constraintManager: ConstraintManagerAdapter;
  costManager?: CostManager;
  finalizer: PipelineFinalizerAdapter;
  getAgendaItems?: (sessionId: string) => string[];
  getContextPayload: (
    sessionId: string
  ) => Promise<PreloadedContextPayload | null>;
  getCurrentTopicLabel?: (
    sessionId: string,
    topicId: string | undefined
  ) => Promise<string | undefined>;
  getKnownClientMembers?: (
    sessionId: string
  ) => Promise<Array<{ id: string; name: string }>>;
  getTopics?: (sessionId: string) => TopicState[];
  /** Contextual alert decision runs independently of detailed extraction. */
  liveAnalyzer?: LiveAnalyzer;
  liveConcurrency?: number;
  /** Hook after pipeline session teardown (e.g. clear session-scoped alert publishers) */
  onPipelineSessionClosed?: (sessionId: string) => void;
  onSpeakerIdentityGuessed?: (
    sessionId: string,
    index: string,
    memberId: string
  ) => void;
  onUtteranceRetracted?: (sessionId: string, utteranceId: string) => void;
  predictivePreloader?: PredictivePreloader;
  preFilter?: PreFilter;
  speakerStateTracker?: SpeakerStateTracker;
  speculativeProcessor?: SpeculativeProcessor;
  tier1?: Tier1StructuralDetector;
  tier2?: Tier2Classifier;
  tier2Cache?: Tier2SemanticCache;
  tier3?: Tier3SearchEngine;
  tier4?: Tier4DeepReasoner;
  tier4Alerts?: Tier4AlertsPublisher;
}

export interface Tier4EvaluationSummary {
  invoked: boolean;
  latencyMs?: number;
  surfaced?: boolean;
}

export interface PipelineEvaluationResult {
  dropped: boolean;
  dropReason?: string;
  latencies: {
    preFilterMs: number;
    retrievalMs?: number;
    analysisMs?: number;
    tier1Ms?: number;
    tier2Ms?: number;
    gateMs?: number;
    tier4Ms?: number;
    pipelineBudgetMs: number;
  };
  mode?: "live" | "legacy";
  retractUtteranceId?: string;
  runTier4: boolean;
  sessionCost?: number;
  speakerPriority?: "high" | "standard" | "low";
  speculativeHit?: boolean;
  speculativeMismatchRatio?: number;
  tier1?: Tier1Result;
  tier2?: Tier2Classification;
  tier2CacheHit?: boolean;
  /** Mirrors Tier 2 classifier `shouldStopForDeepReasoning` (shown in traces / QA) */
  tier2StopDeepReasoning?: boolean;
  tier3?: Tier3Result;
  tier4Outcome?: Tier4EvaluationSummary;
  /** Raw Tier 4 model output — **omit** downstream / logs for privacy unless required */
  tier4Response?: Tier4Response | null;
}
