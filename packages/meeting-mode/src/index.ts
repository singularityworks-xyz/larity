// biome-ignore lint/performance/noBarrelFile: structure convention
export { AlertPublisher, createAlertChannelKeys } from "./alerts/publisher";
export { AlertQueueManager } from "./alerts/queue";
export * from "./alerts/router";
export { AlertSubscriber } from "./alerts/subscriber";
export * from "./alerts/types";
export * from "./briefs/ai-brief-generator";
export * from "./channels";
export * from "./commitment";
export * from "./constraint";
export * from "./pipeline/engine";
export * from "./pipeline/metrics";
export * from "./pipeline/pre-filter";
export * from "./pipeline/tier1";
export * from "./pipeline/tier2";
export { Tier4DeepReasoner } from "./pipeline/tier4";
export * from "./pipeline/tier4-alert";
export * from "./pipeline/tier4-context";
export * from "./pipeline/types";
export * from "./service";
export { SpeakerIdentifier } from "./speaker/identifier";
export * from "./speaker/offline-correlation";
export * from "./speaker/types";
export * from "./speculative";
export * from "./utterance/types";

if (import.meta.main) {
  const { startMeetingModeService } = await import("./service");
  startMeetingModeService().catch((error) => {
    console.error("Unhandled error in meeting-mode service:", error);
    process.exit(1);
  });
}
