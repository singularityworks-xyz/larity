import type { CostManager } from "../cost/manager";
import { SAMBANOVA_TIER2_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import {
  type Tier1StructuralDetector,
  textMatchesTier1PricingPath,
} from "../pipeline/tier1";
import type { Tier2Classifier } from "../pipeline/tier2";
import type { Tier2Classification, Tier2Input } from "../pipeline/types";
import type { Utterance } from "../utterance/types";
import { SpeculativeCache } from "./cache";
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
  tier1: Tier1StructuralDetector;
  tier2: Tier2Classifier;
  cache?: SpeculativeCache;
  costManager?: CostManager;
  getRecentSameSpeakerText?: (
    sessionId: string,
    speakerId: string,
    limit?: number
  ) => string[];
  getCurrentTopicLabel?: (
    sessionId: string,
    topicId?: string
  ) => Promise<string | undefined>;
}

export class SpeculativeProcessor {
  private readonly tier1: Tier1StructuralDetector;
  private readonly tier2: Tier2Classifier;
  private readonly cache: SpeculativeCache;
  private readonly costManager: CostManager | undefined;
  private readonly getRecentSameSpeakerText: NonNullable<
    SpeculativeProcessorDeps["getRecentSameSpeakerText"]
  >;
  private readonly getCurrentTopicLabel: NonNullable<
    SpeculativeProcessorDeps["getCurrentTopicLabel"]
  >;

  constructor(deps: SpeculativeProcessorDeps) {
    this.tier1 = deps.tier1;
    this.tier2 = deps.tier2;
    this.cache = deps.cache ?? new SpeculativeCache();
    this.costManager = deps.costManager;
    this.getRecentSameSpeakerText = deps.getRecentSameSpeakerText ?? (() => []);
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

    this.speculate(partial).catch((error) => {
      log.warn(
        { err: error, sessionId: partial.sessionId },
        "Speculative processing failed silently"
      );
    });
  }

  matchSpeculation(sessionId: string, finalText: string): SpeculativeMatch {
    return this.cache.match(sessionId, finalText);
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
          SAMBANOVA_TIER2_MODEL
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
  }

  closeAll(): void {
    this.cache.closeAll();
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
