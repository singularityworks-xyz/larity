import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  register as globalRegister,
  Histogram,
} from "prom-client";

const METRICS_PREFIX = "larity_pipeline";

const FINALIZER_METRICS_PREFIX = "larity_finalizer";

const LABEL_NAMES = ["session_id"] as const;

export const finalizerEmbedDurationMs = new Histogram({
  name: `${FINALIZER_METRICS_PREFIX}_embed_duration_ms`,
  help: "Gemini embedding wall-clock duration in milliseconds (finalizer)",
  buckets: [5, 25, 50, 100, 200, 400, 800, 1500],
});

export const finalizerPublishWaitMs = new Histogram({
  name: `${FINALIZER_METRICS_PREFIX}_publish_wait_ms`,
  help: "Wall-clock from finalize start until Redis utterance publish",
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
});

export const pipelineContextPayloadCacheHitsTotal = new Counter({
  name: `${METRICS_PREFIX}_context_payload_cache_hits_total`,
  help: "Pipeline reused cached meeting context payload per session",
});

export const pipelineContextPayloadCacheMissesTotal = new Counter({
  name: `${METRICS_PREFIX}_context_payload_cache_misses_total`,
  help: "Pipeline fetched meeting context payload from getter",
});

export const ledgerSnapshotFlushesTotal = new Counter({
  name: `${METRICS_PREFIX}_ledger_snapshot_flushes_total`,
  help: "Ledger snapshots flushed to Redis (after debounce or immediate)",
  labelNames: ["kind"],
});

export const pipelinePrefilterDuration = new Histogram({
  name: `${METRICS_PREFIX}_prefilter_duration_ms`,
  help: "Pre-filter wall-clock duration in milliseconds",
  buckets: [1, 5, 10, 25, 50, 100, 250],
});

export const pipelineTier1Duration = new Histogram({
  name: `${METRICS_PREFIX}_tier1_duration_ms`,
  help: "Tier 1 structural detection wall-clock duration in milliseconds",
  buckets: [1, 5, 10, 25, 50, 100, 250],
});

export const pipelineTier2Duration = new Histogram({
  name: `${METRICS_PREFIX}_tier2_duration_ms`,
  help: "Tier 2 LLM classification wall-clock duration in milliseconds",
  buckets: [10, 25, 50, 100, 200, 400, 800],
});

export const pipelineTier3Duration = new Histogram({
  name: `${METRICS_PREFIX}_tier3_duration_ms`,
  help: "Tier 3 embedding search wall-clock duration in milliseconds",
  buckets: [5, 10, 25, 50, 100, 200, 400],
});

export const pipelineTier4Duration = new Histogram({
  name: `${METRICS_PREFIX}_tier4_duration_ms`,
  help: "Tier 4 deep reasoning wall-clock duration in milliseconds",
  buckets: [50, 100, 200, 400, 800, 1500, 3000],
});

export const pipelineGateDuration = new Histogram({
  name: `${METRICS_PREFIX}_gate_duration_ms`,
  help: "Gate decision wall-clock duration in milliseconds",
  buckets: [0.5, 1, 2, 5, 10, 25],
});

export const pipelineTotalDuration = new Histogram({
  name: `${METRICS_PREFIX}_total_duration_ms`,
  help: "Total pipeline budget wall-clock duration in milliseconds",
  buckets: [10, 25, 50, 100, 200, 400, 800, 1500],
});

export const pipelineDroppedTotal = new Counter({
  name: `${METRICS_PREFIX}_dropped_total`,
  help: "Total number of utterances dropped by the pre-filter",
  labelNames: ["reason"],
});

export const pipelineTier2CacheHitsTotal = new Counter({
  name: `${METRICS_PREFIX}_tier2_cache_hits_total`,
  help: "Total number of Tier 2 semantic cache hits",
});

export const pipelineTier2CacheMissesTotal = new Counter({
  name: `${METRICS_PREFIX}_tier2_cache_misses_total`,
  help: "Total number of Tier 2 semantic cache misses (LLM invoked)",
});

export const pipelineTier4InvokedTotal = new Counter({
  name: `${METRICS_PREFIX}_tier4_invoked_total`,
  help: "Total number of Tier 4 invocations",
  labelNames: ["surfaced"],
});

export const pipelineTier4SuppressedTotal = new Counter({
  name: `${METRICS_PREFIX}_tier4_suppressed_total`,
  help: "Total number of Tier 4 suppressions",
  labelNames: ["reason"],
});

export const pipelineSessionCostDollars = new Gauge({
  name: `${METRICS_PREFIX}_session_cost_dollars`,
  help: "Current session cost in USD",
  labelNames: LABEL_NAMES,
});

export const pipelineSpeculativeHitsTotal = new Counter({
  name: `${METRICS_PREFIX}_speculative_hits_total`,
  help: "Total number of speculative cache hits that saved a Tier 2 LLM call",
});

export const pipelineSpeculativeMissesTotal = new Counter({
  name: `${METRICS_PREFIX}_speculative_misses_total`,
  help: "Total number of speculative cache misses requiring full Tier 2 processing",
});

export const pipelineSpeculativeDiscardsTotal = new Counter({
  name: `${METRICS_PREFIX}_speculative_discards_total`,
  help: "Total number of speculative results discarded due to text mismatch",
});

let defaultMetricsRunning = false;

export function startDefaultMetrics(): void {
  if (defaultMetricsRunning) {
    return;
  }
  collectDefaultMetrics({ prefix: `${METRICS_PREFIX}_nodejs_` });
  defaultMetricsRunning = true;
}

export function getMetricsText(): Promise<string> {
  return globalRegister.metrics();
}
