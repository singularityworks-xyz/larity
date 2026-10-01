import type { CostManager } from "../cost/manager";
import { SPECULATIVE_COST_TRACK } from "../cost/manager";
import { GENERALCOMPUTE_TIER2_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import {
  type Tier1StructuralDetector,
  textMatchesTier1PricingPath,
} from "../pipeline/tier1";
import type { Tier2Classifier } from "../pipeline/tier2";
import type { Tier2Classification, Tier2Input } from "../pipeline/types";
import type { Utterance } from "../utterance/types";
import { SpeculativeCache } from "./cache";
import { SpeculationThrottle } from "./throttle";
import type { PartialUtterance, SpeculativeMatch } from "./types";
import {
  getSpeakerProcessingPriority,
  SPECULATIVE_CONFIDENCE_THRESHOLD,
} from "./types";

const log = createMeetingModeLogger("speculative-processor");

const WHITESPACE_REGEX = /\s+/g;

const HIGH_SIGNAL_KEYWORDS = [
  "commit",
  "deadline",
  "promise",
  "guarantee",
  "agree",
  "api key",
  "password",
  "secret",
  "nda",
  "confidential",
  "policy",
  "compliance",
  "legal",
  "security",
  "breach",
  "risk",
  "threat",
  "violation",
  "scope",
  "budget",
  "pricing",
  "contract",
] as const;

const HIGH_SIGNAL_KEYWORD_SET = new Set<string>(HIGH_SIGNAL_KEYWORDS);

export interface SpeculativeProcessorDeps {
  cache?: SpeculativeCache;
  costManager?: CostManager;
  getCurrentTopicLabel?: (
    sessionId: string,
    topicId?: string
  ) => Promise<string | undefined>;
  /**
   * Sync read of the engine's Phase 2 session cache (P3.3). Speculative
   * Tier 2 must not trigger its own HGET + Postgres fetch per partial.
   */
  getKnownClientMembers?: (
    sessionId: string
  ) => Array<{ id: string; name: string }>;
  getRecentSameSpeakerText?: (
    sessionId: string,
    speakerId: string,
    limit?: number
  ) => string[];
  /** Per session+speaker speculation throttle (P3.1); injectable for tests. */
  throttle?: SpeculationThrottle;
  tier1: Tier1StructuralDetector;
  tier2: Tier2Classifier;
}

export class SpeculativeProcessor {
  private readonly tier1: Tier1StructuralDetector;
  private readonly tier2: Tier2Classifier;
  private readonly cache: SpeculativeCache;
  private readonly throttle: SpeculationThrottle;
  private readonly costManager: CostManager | undefined;
  private readonly getRecentSameSpeakerText: NonNullable<
    SpeculativeProcessorDeps["getRecentSameSpeakerText"]
  >;
  private readonly getKnownClientMembers: NonNullable<
    SpeculativeProcessorDeps["getKnownClientMembers"]
  >;
  private readonly getCurrentTopicLabel: NonNullable<
    SpeculativeProcessorDeps["getCurrentTopicLabel"]
  >;

  constructor(deps: SpeculativeProcessorDeps) {
    this.tier1 = deps.tier1;
    this.tier2 = deps.tier2;
    this.cache = deps.cache ?? new SpeculativeCache();
    this.throttle = deps.throttle ?? new SpeculationThrottle();
    this.costManager = deps.costManager;
    this.getRecentSameSpeakerText = deps.getRecentSameSpeakerText ?? (() => []);
    this.getKnownClientMembers = deps.getKnownClientMembers ?? (() => []);
    this.getCurrentTopicLabel =
      deps.getCurrentTopicLabel ?? (async () => undefined);
  }

  processPartial(partial: PartialUtterance): void {
    if (partial.confidence < SPECULATIVE_CONFIDENCE_THRESHOLD) {
      return;
    }

    const priority = getSpeakerProcessingPriority(partial.speaker);
    if (priority === "low") {
      return;
    }

    // P3.1: at most one speculation per 500 ms per speaker, only when the
    // partial grew by 4+ words, and never while an earlier speculation whose
    // text is a prefix of this partial is still in flight.
    if (
      !this.throttle.shouldSpeculate(
        partial.sessionId,
        partial.speaker.speakerId,
        partial.text
      )
    ) {
      return;
    }
    this.throttle.markStarted(
      partial.sessionId,
      partial.speaker.speakerId,
      partial.text
    );

    this.speculate(partial).then(
      () => {
        this.throttle.markSettled(
          partial.sessionId,
          partial.speaker.speakerId,
          partial.text
        );
      },
      (error) => {
        this.throttle.markSettled(
          partial.sessionId,
          partial.speaker.speakerId,
          partial.text
        );
        log.warn(
          { err: error, sessionId: partial.sessionId },
          "Speculative processing failed silently"
        );
      }
    );
  }

  matchSpeculation(
    sessionId: string,
    finalText: string,
    speakerId?: string
  ): SpeculativeMatch {
    return this.cache.match(sessionId, finalText, speakerId);
  }

  private async speculate(partial: PartialUtterance): Promise<void> {
    const mockUtterance = createMockUtterance(partial);

    const tier1Result = this.tier1.detect(mockUtterance);

    if (tier1Result.technicalHit || tier1Result.blocklistHit) {
      this.cache.set(partial.sessionId, partial.speaker.speakerId, {
        partialText: partial.text,
        classification: createHighSignalClassification(),
        tier1Result,
        predictedTopicId: undefined,
        createdAt: Date.now(),
      });
      return;
    }

    const recentSameSpeaker = this.getRecentSameSpeakerText(
      partial.sessionId,
      partial.speaker.speakerId,
      3
    );

    const topicLabel = await this.getCurrentTopicLabel(
      partial.sessionId,
      undefined
    );

    const input: Tier2Input = {
      utterance: partial.text,
      speaker: partial.speaker,
      recentSameSpeaker,
      topicLabel,
      structuralPricingCue: textMatchesTier1PricingPath(partial.text),
      // P3.3: session-cached members — no per-partial DB round trip.
      knownClientMembers: this.getKnownClientMembers(partial.sessionId),
    };

    const tier2Outcome = await this.tier2.classify(input, partial.sessionId);

    if (
      this.costManager &&
      ((tier2Outcome.promptTokens ?? 0) > 0 ||
        (tier2Outcome.completionTokens ?? 0) > 0)
    ) {
      this.costManager
        .recordCost(
          partial.sessionId,
          tier2Outcome.promptTokens ?? 0,
          tier2Outcome.completionTokens ?? 0,
          GENERALCOMPUTE_TIER2_MODEL,
          // P3.3: speculative spend stays visible under its own track for
          // the P3.6 go/no-go decision (session total still includes it).
          { trackAs: SPECULATIVE_COST_TRACK }
        )
        .catch((err) =>
          log.warn(
            { err, sessionId: partial.sessionId },
            "Speculative Tier2 cost recording failed"
          )
        );
    }

    this.cache.set(partial.sessionId, partial.speaker.speakerId, {
      partialText: partial.text,
      classification: tier2Outcome.classification,
      tier1Result,
      predictedTopicId: undefined,
      createdAt: Date.now(),
    });
  }

  closeSession(sessionId: string): void {
    this.cache.closeSession(sessionId);
    this.throttle.closeSession(sessionId);
  }

  closeAll(): void {
    this.cache.closeAll();
    this.throttle.closeAll();
  }
}

function createMockUtterance(partial: PartialUtterance): Utterance {
  return {
    utteranceId: `speculative_${partial.timestamp}`,
    sessionId: partial.sessionId,
    speaker: partial.speaker,
    text: partial.text,
    timestamp: partial.timestamp,
    confidenceScore: partial.confidence,
    startOffset: 0,
    duration: 0,
    wordCount: partial.text.split(WHITESPACE_REGEX).filter(Boolean).length,
    mergedCount: 1,
  };
}

function createHighSignalClassification(): Tier2Classification {
  return {
    intent: "concern",
    commitmentType: null,
    tone: "neutral",
    riskSignals: ["speculative_structural_hit"],
    extractedData: {},
    confidence: 0.9,
  };
}

export function hasHighSignalKeywords(text: string): boolean {
  const normalized = text.toLowerCase();
  for (const keyword of HIGH_SIGNAL_KEYWORD_SET) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  return false;
}
