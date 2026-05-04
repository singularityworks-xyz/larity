import type { ClarityCheckInput, SpeakerStateAlert } from "./types";
import { DEFAULT_SPEAKER_STATE_CONFIG } from "./types";

export function checkMissingClarity(
  input: ClarityCheckInput,
  config = DEFAULT_SPEAKER_STATE_CONFIG
): SpeakerStateAlert | null {
  if (!input.isTopicShift) {
    return null;
  }

  if (!input.prevTopicId) {
    return null;
  }

  if (input.prevTopicUtteranceCount < 3) {
    return null;
  }

  if (!input.prevTopicCompleteness) {
    return null;
  }

  const completeness = input.prevTopicCompleteness;
  const missing: string[] = [];

  for (const field of config.clarityRequiredFields) {
    if (field === "owner" && !completeness.hasOwner) {
      missing.push("owner");
    } else if (field === "deadline" && !completeness.hasDeadline) {
      missing.push("deadline");
    } else if (field === "actions" && !completeness.hasActionItems) {
      missing.push("action items");
    }
  }

  if (missing.length < 2) {
    return null;
  }

  const alert: SpeakerStateAlert = {
    category: "missing_clarity",
    severity: "medium",
    message: `Previous topic is missing ${missing.join(", ")}.`,
    surfaceReason: `Topic "${input.prevTopicId}" ended without: ${missing.join(", ")}.`,
    suggestion:
      "Before moving on, clarify who owns this, the deadline, and next steps.",
    speakerId: "",
    topicId: input.prevTopicId,
    confidence: 0.8,
  };

  return alert;
}
