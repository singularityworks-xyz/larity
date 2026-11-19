/**
 * pipeline/metrics.ts — dependency-free in-process latency observability.
 *
 * Lightweight histograms (p50/p95/p99, count, min/max/mean) plus counters,
 * held in a process-wide registry. Aggregate only: metric names MUST NOT
 * contain per-session labels (no sessionId/userId in names) to avoid
 * unbounded cardinality.
 *
 * No external dependencies. A `prom-client` exporter can be layered on top
 * of `snapshot()` later without changing call sites.
 */

/** Upper bound on retained samples per histogram (oldest dropped past cap). */
const MAX_SAMPLES_PER_HISTOGRAM = 1024;

export interface HistogramSnapshot {
  count: number;
  max: number;
  mean: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  counters: Record<string, number>;
  histograms: Record<string, HistogramSnapshot>;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

class Histogram {
  private samples: number[] = [];

  record(valueMs: number): void {
    if (!Number.isFinite(valueMs)) {
      return;
    }
    this.samples.push(valueMs);
    if (this.samples.length > MAX_SAMPLES_PER_HISTOGRAM) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES_PER_HISTOGRAM);
    }
  }

  snapshot(): HistogramSnapshot | null {
    if (this.samples.length === 0) {
      return null;
    }
    const sorted = [...this.samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, value) => acc + value, 0);
    return {
      count: sorted.length,
      max: sorted.at(-1) ?? 0,
      mean: sum / sorted.length,
      min: sorted[0] ?? 0,
      p50: quantile(sorted, 0.5),
      p95: quantile(sorted, 0.95),
      p99: quantile(sorted, 0.99),
    };
  }

  reset(): void {
    this.samples = [];
  }
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, Histogram>();

  /** Record a latency sample (ms) on a named histogram. */
  record(name: string, valueMs: number): void {
    let histogram = this.histograms.get(name);
    if (!histogram) {
      histogram = new Histogram();
      this.histograms.set(name, histogram);
    }
    histogram.record(valueMs);
  }

  /** Increment a named counter by `delta` (default 1). */
  increment(name: string, delta = 1): void {
    if (!Number.isFinite(delta)) {
      return;
    }
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  snapshot(): MetricsSnapshot {
    const histograms: Record<string, HistogramSnapshot> = {};
    for (const [name, histogram] of this.histograms) {
      const snap = histogram.snapshot();
      if (snap) {
        histograms[name] = snap;
      }
    }
    return {
      counters: Object.fromEntries(this.counters),
      histograms,
    };
  }

  reset(): void {
    this.histograms.clear();
    this.counters.clear();
  }
}

/** Process-wide registry for meeting-mode. Aggregate only — no per-session labels. */
export const metrics = new MetricsRegistry();

export function recordHistogram(name: string, valueMs: number): void {
  metrics.record(name, valueMs);
}

export function incrementCounter(name: string, delta = 1): void {
  metrics.increment(name, delta);
}

export function getMetricsSnapshot(): MetricsSnapshot {
  return metrics.snapshot();
}

export function resetMetrics(): void {
  metrics.reset();
}
