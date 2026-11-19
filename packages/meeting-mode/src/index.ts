// biome-ignore lint/performance/noBarrelFile: structure convention
export { AlertPublisher, createAlertChannelKeys } from "./alerts/publisher";
export { AlertQueueManager } from "./alerts/queue";
export * from "./alerts/router";
export { AlertSubscriber } from "./alerts/subscriber";
export * from "./alerts/types";
export * from "./analysis/engine";
export * from "./analysis/metrics";
export * from "./analysis/pre-filter";
export * from "./analysis/speculative";
export * from "./analysis/tiers/tier1/tier1";
export * from "./analysis/tiers/tier2/tier2";
export { Tier4DeepReasoner } from "./analysis/tiers/tier4/tier4";
export * from "./analysis/tiers/tier4/tier4-alert";
export * from "./analysis/tiers/tier4/tier4-context";
export * from "./analysis/types";
export * from "./briefs/ai-brief-generator";
export * from "./commitment";
export * from "./constraint";
export * from "./events/channels";
export * from "./service";
export { SpeakerIdentifier } from "./transcript/speakers/identifier";
export * from "./transcript/speakers/offline-correlation";
export * from "./transcript/speakers/types";
export * from "./transcript/utterances/types";

if (import.meta.main) {
  const { startMeetingModeService } = await import("./service");
  startMeetingModeService().catch((error) => {
    console.error("Unhandled error in meeting-mode service:", error);
    process.exit(1);
  });
}
