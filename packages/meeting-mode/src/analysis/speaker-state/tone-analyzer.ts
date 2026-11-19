import type { SpeakerState, SpeakerStateAlert, ToneTrajectory } from "./types";
import { DEFAULT_SPEAKER_STATE_CONFIG, TONE_NUMERIC_SCALE } from "./types";

export interface ToneAnalysisResult {
  alert: SpeakerStateAlert | null;
  trajectory: ToneTrajectory;
}

export function analyzeToneTrajectory(
  state: SpeakerState,
  config = DEFAULT_SPEAKER_STATE_CONFIG
): ToneAnalysisResult {
  const { toneHistory, speaker } = state;

  if (toneHistory.length < 3) {
    return { trajectory: "stable", alert: null };
  }

  const cutoff = state.lastSpoke - config.toneShiftWindowMs;
  const recent = toneHistory.filter((entry) => entry.timestamp >= cutoff);

  if (recent.length < 3) {
    return { trajectory: "stable", alert: null };
  }

  const scores = recent.map((entry) => TONE_NUMERIC_SCALE[entry.tone] ?? 0);

  const first = scores[0] as number;
  const last = scores.at(-1) as number;
  const delta = last - first;

  let trajectory: ToneTrajectory = "stable";
  if (delta > config.toneShiftThreshold) {
    trajectory = "escalating";
  } else if (delta < -config.toneShiftThreshold) {
    trajectory = "de-escalating";
  }

  if (trajectory !== "escalating") {
    return { trajectory, alert: null };
  }

  const speakerLabel =
    speaker.type === "EXTERNAL" ? speaker.name : speaker.name;

  const alert: SpeakerStateAlert = {
    category: "tone_warning",
    severity: speaker.type === "EXTERNAL" ? "medium" : "low",
    message: `${speakerLabel}'s tone is escalating — consider adjusting approach.`,
    surfaceReason: `Tone shifted from ${recent[0]?.tone} to ${recent.at(-1)?.tone} over the last ${Math.round(((recent.at(-1)?.timestamp ?? 0) - (recent[0]?.timestamp ?? 0)) / 60_000)} minutes.`,
    suggestion:
      speaker.type === "EXTERNAL"
        ? "Pause and acknowledge their concern before continuing."
        : "Consider rephrasing to keep the discussion constructive.",
    speakerId: speaker.speakerId,
    confidence: Math.min(0.95, 0.7 + Math.abs(delta) * 0.05),
  };

  return { trajectory, alert };
}
