import { describe, expect, test } from "bun:test";
import { MetricsRegistry, metrics, resetMetrics } from "./metrics";

describe("stt MetricsRegistry", () => {
  test("records histograms and counters, resets cleanly", () => {
    const registry = new MetricsRegistry();
    registry.record("stt.deepgram_connect_ms", 250);
    registry.record("stt.deepgram_connect_ms", 350);
    registry.increment("stt.reconnects_total");

    const snap = registry.snapshot();
    expect(snap.histograms["stt.deepgram_connect_ms"]?.count).toBe(2);
    expect(snap.histograms["stt.deepgram_connect_ms"]?.min).toBe(250);
    expect(snap.counters["stt.reconnects_total"]).toBe(1);

    registry.reset();
    expect(registry.snapshot()).toEqual({ counters: {}, histograms: {} });
  });

  test("module singleton records and resets", () => {
    resetMetrics();
    metrics.increment("stt.orphan_events_total");
    expect(metrics.snapshot().counters["stt.orphan_events_total"]).toBe(1);
    resetMetrics();
    expect(metrics.snapshot()).toEqual({ counters: {}, histograms: {} });
  });
});
