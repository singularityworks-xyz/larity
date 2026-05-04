import type { EngagementLevel, SpeakerState, SpeakerStateAlert } from "./types";
import { DEFAULT_SPEAKER_STATE_CONFIG } from "./types";

export interface EngagementResult {
  level: EngagementLevel;
  alert: SpeakerStateAlert | null;
}

export function detectDisengagement(
  state: SpeakerState,
  config = DEFAULT_SPEAKER_STATE_CONFIG
): EngagementResult {
  const { toneHistory, speaker, utteranceCount } = state;

  if (utteranceCount < config.disengagementMinResponses) {
    return { level: "active", alert: null };
  }

  if (speaker.type !== "EXTERNAL") {
    return { level: "active", alert: null };
  }

  let consecutiveShort = 0;
  for (let i = toneHistory.length - 1; i >= 0; i--) {
    if (toneHistory[i].wordCount <= config.disengagementShortResponseWords) {
      consecutiveShort++;
    } else {
      break;
    }
  }

  if (consecutiveShort >= config.disengagementConsecutiveShort) {
    const alert: SpeakerStateAlert = {
      category: "client_disengagement",
      severity: "high",
      message: `${speaker.name} appears disengaged — only brief responses recently.`,
      surfaceReason: `Last ${consecutiveShort} responses were ${config.disengagementShortResponseWords} words or fewer.`,
      suggestion:
        "Pause the current topic and ask an open-ended question to re-engage them.",
      speakerId: speaker.speakerId,
      confidence: 0.85,
    };
    return { level: "disengaged", alert };
  }

  const sessionDuration = (state.lastSpoke - state.sessionStart) / 60_000;
  if (sessionDuration < 2) {
    return { level: "active", alert: null };
  }

  const firstHalfCount = Math.floor(utteranceCount / 2);
  const firstHalfDuration =
    firstHalfCount > 0 && toneHistory.length > firstHalfCount
      ? (toneHistory[firstHalfCount - 1].timestamp - state.sessionStart) /
        60_000
      : sessionDuration / 2;

  const secondHalfDuration = sessionDuration - firstHalfDuration;

  if (firstHalfDuration <= 0 || secondHalfDuration <= 0) {
    return { level: "active", alert: null };
  }

  const firstHalfFreq = firstHalfCount / firstHalfDuration;
  const secondHalfCount = utteranceCount - firstHalfCount;
  const secondHalfFreq = secondHalfCount / secondHalfDuration;

  if (
    firstHalfFreq > 0 &&
    secondHalfFreq / firstHalfFreq < 1 - config.disengagementFrequencyDropRatio
  ) {
    const alert: SpeakerStateAlert = {
      category: "client_disengagement",
      severity: "medium",
      message: `${speaker.name}'s participation has dropped significantly.`,
      surfaceReason: `Response frequency fell from ${firstHalfFreq.toFixed(1)}/min to ${secondHalfFreq.toFixed(1)}/min.`,
      suggestion:
        "Check in with them directly — they may have concerns they haven't voiced.",
      speakerId: speaker.speakerId,
      confidence: 0.75,
    };
    return { level: "passive", alert };
  }

  return { level: "active", alert: null };
}
