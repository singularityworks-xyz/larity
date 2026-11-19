import { describe, expect, test } from "bun:test";
import { MetricsRegistry, metrics, resetMetrics } from "./metrics";

describe("MetricsRegistry", () => {
  test("records histogram samples and reports quantiles", () => {
    const registry = new MetricsRegistry();
    for (let i = 1; i <= 100; i++) {
      registry.record("latency_ms", i);
    }
    const snap = registry.snapshot();
    const hist = snap.histograms.latency_ms;
    expect(hist).toBeDefined();
    expect(hist?.count).toBe(100);
    expect(hist?.min).toBe(1);
    expect(hist?.max).toBe(100);
    expect(hist?.p50).toBe(50);
    expect(hist?.p95).toBe(95);
    expect(hist?.p99).toBe(99);
    expect(hist?.mean).toBeCloseTo(50.5, 5);
  });

  test("omits empty histograms from snapshot", () => {
    const registry = new MetricsRegistry();
    expect(registry.snapshot().histograms).toEqual({});
  });

  test("ignores non-finite samples", () => {
    const registry = new MetricsRegistry();
    registry.record("bad", Number.NaN);
    registry.record("bad", Number.POSITIVE_INFINITY);
    expect(registry.snapshot().histograms).toEqual({});
  });

  test("caps retained samples at the bound, dropping oldest", () => {
    const registry = new MetricsRegistry();
    for (let i = 1; i <= 1100; i++) {
      registry.record("capped", i);
    }
    const hist = registry.snapshot().histograms.capped;
    expect(hist?.count).toBe(1024);
    // Oldest 76 samples (1..76) evicted, so min is 77.
    expect(hist?.min).toBe(77);
    expect(hist?.max).toBe(1100);
  });

  test("increments counters and ignores non-finite deltas", () => {
    const registry = new MetricsRegistry();
    registry.increment("timeouts_total");
    registry.increment("timeouts_total", 2);
    registry.increment("timeouts_total", Number.NaN);
    expect(registry.snapshot().counters.timeouts_total).toBe(3);
  });

  test("reset clears histograms and counters", () => {
    const registry = new MetricsRegistry();
    registry.record("h", 5);
    registry.increment("c");
    registry.reset();
    expect(registry.snapshot()).toEqual({ counters: {}, histograms: {} });
  });

  test("module singleton records and resets", () => {
    resetMetrics();
    metrics.record("shared", 10);
    metrics.increment("shared_total");
    const snap = metrics.snapshot();
    expect(snap.histograms.shared?.count).toBe(1);
    expect(snap.counters.shared_total).toBe(1);
    resetMetrics();
    expect(metrics.snapshot()).toEqual({ counters: {}, histograms: {} });
  });
});
