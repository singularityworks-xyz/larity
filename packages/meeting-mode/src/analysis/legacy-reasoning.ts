import type { CostManager } from "../cost/manager";
import { GEMINI_TIER4_MODEL } from "../env";
import { createMeetingModeLogger } from "../logger";
import type { Utterance } from "../transcript/utterances/types";
import type {
  Tier4AlertsPublisher,
  Tier4EvaluationSummary,
} from "./engine-types";
import type { Tier4DeepReasoner } from "./tiers/tier4/tier4";
import { buildAlertFromTier4Response } from "./tiers/tier4/tier4-alert";
import type { Tier4Context, Tier4Response } from "./types";

const log = createMeetingModeLogger("pipeline-engine");

interface LegacyReasoningInput {
  assembleContext: () => Promise<Tier4Context>;
  costManager: CostManager;
  runTier4: boolean;
  tier4?: Tier4DeepReasoner;
  tier4Alerts?: Tier4AlertsPublisher;
  utterance: Utterance;
}

export async function evaluateLegacyReasoning({
  utterance,
  runTier4,
  tier4,
  tier4Alerts,
  costManager,
  assembleContext,
}: LegacyReasoningInput): Promise<{
  tier4Response: Tier4Response | null;
  tier4Outcome: Tier4EvaluationSummary;
  tier4Ms?: number;
}> {
  if (!runTier4) {
    return {
      tier4Response: null,
      tier4Outcome: { invoked: false },
    };
  }

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
    const tier4Ctx = await assembleContext();

    const tier4WallStart = performance.now();
    const tier4Result = await tier4.reason(tier4Ctx);
    tier4Ms = performance.now() - tier4WallStart;
    tier4Response = tier4Result.response;

    if (tier4Result.promptTokens > 0 || tier4Result.completionTokens > 0) {
      costManager
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
