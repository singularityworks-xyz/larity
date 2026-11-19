import type { CostManager } from "../cost/manager";
import { createMeetingModeLogger } from "../logger";
import type { Utterance } from "../transcript/utterances/types";
import { incrementCounter } from "./metrics";
import { SPEAKER_AWARE_TIER4_CONFIDENCE } from "./speculative/types";
import type { Tier1Result, Tier2Classification, Tier3Result } from "./types";

const log = createMeetingModeLogger("pipeline-engine");

/**
 * Backlog shed threshold (P2.8): when an utterance is dequeued with more
 * than this many evaluations still queued behind it, Tier 4 is skipped for
 * it (Tier 1–3 still run). Bounds per-session alert latency under bursts
 * instead of cascading one slow Tier 4 after another.
 */
const TIER4_BACKLOG_SKIP_DEPTH = 2;

export function shouldRunLiveAnalysis(
  costManager: CostManager,
  cost: number,
  tier1: Tier1Result,
  tier3: Tier3Result
): boolean {
  if (costManager.isHardCapReached(cost)) {
    return false;
  }
  if (!costManager.isWarningMode(cost)) {
    return true;
  }
  return (
    tier1.technicalHit ||
    tier1.blocklistHit ||
    tier1.pricingHit ||
    tier3.forceTier4
  );
}

export function isHighSignal(
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

export function tier4PassesStructuralOverride(
  tier1: Tier1Result,
  shouldStop: boolean
): boolean {
  if (!shouldStop) {
    return true;
  }
  return tier1.technicalHit || tier1.blocklistHit || tier1.pricingHit;
}

export function applySpeakerAwareGate(
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

export function applyCostGates(
  costManager: CostManager,
  runTier4: boolean,
  sessionId: string,
  sessionCost: number,
  tier1: Tier1Result,
  tier2Classification: Tier2Classification
): { runTier4: boolean; suppressReason: string | undefined } {
  if (costManager.isHardCapReached(sessionCost)) {
    log.info(
      { sessionId, sessionCost, limit: 2.0 },
      "Cost hard cap reached — Tier 4 disabled"
    );
    return { runTier4: false, suppressReason: "cost_hard_cap" };
  }

  if (
    costManager.isWarningMode(sessionCost) &&
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

export function applyBacklogShed(
  runTier4: boolean,
  backlogDepth: number,
  utterance: Utterance
): boolean {
  if (runTier4 && backlogDepth > TIER4_BACKLOG_SKIP_DEPTH) {
    incrementCounter("pipeline.tier4_skipped_backlog_total");
    log.info(
      {
        utteranceId: utterance.utteranceId,
        sessionId: utterance.sessionId,
        backlogDepth,
      },
      "Tier 4 skipped: evaluation backlog too deep"
    );
    return false;
  }
  return runTier4;
}
