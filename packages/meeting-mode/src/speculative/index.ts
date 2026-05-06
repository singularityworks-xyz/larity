// biome-ignore lint/performance/noBarrelFile: structure convention
export { SpeculativeCache } from "./cache";
export { PredictivePreloader } from "./predictive-preloader";
export { hasHighSignalKeywords, SpeculativeProcessor } from "./processor";
export type {
  PartialUtterance,
  SpeakerProcessingPriority,
  SpeculativeMatch,
  SpeculativeResult,
} from "./types";
export {
  getSpeakerProcessingPriority,
  SILENT_COLLABORATOR_THRESHOLDS,
  SPEAKER_AWARE_TIER4_CONFIDENCE,
  SPECULATIVE_CONFIDENCE_THRESHOLD,
  SPECULATIVE_MAX_ENTRIES_PER_SESSION,
  SPECULATIVE_MISMATCH_THRESHOLD,
  SPECULATIVE_TTL_MS,
} from "./types";
