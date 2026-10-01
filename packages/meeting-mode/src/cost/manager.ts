import type Redis from "ioredis";
import { COST_CAP_CACHE_TTL_MS } from "../env";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("cost-manager");

const COST_KEY_PREFIX = "meeting:cost:";

const MODEL_PRICING: Record<string, { inputRate: number; outputRate: number }> =
  {
    "gemini-3.1-flash-lite": { inputRate: 0.25, outputRate: 1.5 },
    // Tier 4 default (GEMINI_TIER4_MODEL="gemini-3.5-flash-lite").
    // Public list pricing (global), verified against the rate card.
    "gemini-3.5-flash-lite": { inputRate: 0.3, outputRate: 2.5 },
    "gemini-pro": { inputRate: 1.25, outputRate: 1.25 },
    // Tier 2 default (GENERALCOMPUTE_TIER2_MODEL="gpt-oss-120b"). General
    // Compute list pricing: $0.21 in / $0.79 out per 1M. The prefixed alias
    // is kept so env overrides in either form resolve correctly.
    "gpt-oss-120b": { inputRate: 0.21, outputRate: 0.79 },
    "openai/gpt-oss-120b": { inputRate: 0.21, outputRate: 0.79 },
    // Gemini flash via the OpenAI-compatible endpoint (Tier 2 fallback
    // provider / E2E). Public list pricing, approximate.
    "gemini-2.5-flash": { inputRate: 0.3, outputRate: 2.5 },
    "llama-3.3-70b": { inputRate: 0.85, outputRate: 1.2 },
    "llama3.1-8b": { inputRate: 0.1, outputRate: 0.1 },
  };

/** Strip an `org/` provider prefix so `openai/gpt-oss-120b` matches `gpt-oss-120b`. */
function normalizeModelKey(model: string): string {
  const slash = model.indexOf("/");
  return slash >= 0 ? model.slice(slash + 1) : model;
}

/** True when per-million-token rates are known for `model` (exact or normalized). */
export function hasPricingForModel(model: string): boolean {
  return model in MODEL_PRICING || normalizeModelKey(model) in MODEL_PRICING;
}

function pricingForModel(model: string): {
  inputRate: number;
  outputRate: number;
} {
  return (
    MODEL_PRICING[model] ??
    MODEL_PRICING[normalizeModelKey(model)] ??
    MODEL_PRICING["gemini-3.1-flash-lite"] ?? {
      inputRate: 0.075,
      outputRate: 0.075,
    }
  );
}

const SESSION_COST_LIMIT = 2.0;
const WARNING_THRESHOLD = 1.6;

/**
 * Track name for speculative Tier 2 spend (P3.3). Speculative cost still
 * counts toward the session total (budget accuracy) and is additionally
 * accumulated under `meeting:cost:{sessionId}:tier2_speculative` so
 * speculative spend stays visible for the P3.6 go/no-go decision.
 */
export const SPECULATIVE_COST_TRACK = "tier2_speculative";

export interface RecordCostOptions {
  /**
   * Also accumulate this cost under a separate per-session track
   * (`meeting:cost:{sessionId}:{trackAs}`), readable via `getTrackedCost`.
   */
  trackAs?: string;
}

export interface CostManagerOptions {
  /** TTL for hot-cache reads on `getSessionCost` */
  hotCacheTtlMs?: number;
}

const REDIS_ERROR_THRESHOLD = 3;
const REDIS_COOLDOWN_MS = 30_000;

export class CostManager {
  private readonly redis: Redis | null;
  private readonly costs = new Map<string, number>();
  private readonly trackedCosts = new Map<string, number>();
  private readonly sessionTracks = new Map<string, Set<string>>();
  private readonly sessionRedisDisabled = new Map<string, number | true>();
  private readonly sessionRedisErrors = new Map<string, number>();
  private readonly hotCacheTtlMs: number;
  private readonly hotCostReads = new Map<
    string,
    { value: number; readAt: number }
  >();

  constructor(redis?: Redis, options: CostManagerOptions = {}) {
    this.redis = redis ?? null;
    this.hotCacheTtlMs = options.hotCacheTtlMs ?? COST_CAP_CACHE_TTL_MS;
  }

  /** Reconcile hot cache from Redis (e.g. after session hydrate). */
  async primeSessionCost(sessionId: string): Promise<void> {
    const fresh = await this.readSessionCostUncached(sessionId);
    this.hotCostReads.set(sessionId, {
      value: fresh,
      readAt: Date.now(),
    });
    this.costs.set(sessionId, fresh);
  }

  private hotCacheValid(sessionId: string): number | undefined {
    const row = this.hotCostReads.get(sessionId);
    if (!row) {
      return;
    }
    if (Date.now() - row.readAt > this.hotCacheTtlMs) {
      return;
    }
    return row.value;
  }

  private setHotCost(sessionId: string, value: number): void {
    this.hotCostReads.set(sessionId, { value, readAt: Date.now() });
  }

  private redisAvailableForSession(sessionId: string): boolean {
    if (!this.redis) {
      return false;
    }
    if (this.sessionRedisDisabled.get(sessionId)) {
      const disabledUntil = this.sessionRedisDisabled.get(sessionId);
      if (typeof disabledUntil === "number" && Date.now() < disabledUntil) {
        return false;
      }
      if (typeof disabledUntil === "boolean") {
        return false;
      }
    }
    return true;
  }

  private recordRedisError(sessionId: string): void {
    const count = (this.sessionRedisErrors.get(sessionId) ?? 0) + 1;
    this.sessionRedisErrors.set(sessionId, count);
    if (count >= REDIS_ERROR_THRESHOLD) {
      this.sessionRedisDisabled.set(sessionId, Date.now() + REDIS_COOLDOWN_MS);
      this.sessionRedisErrors.delete(sessionId);
      log.warn(
        { sessionId, errorCount: count, cooldownMs: REDIS_COOLDOWN_MS },
        "Redis errors exceeded threshold, disabling Redis for session until cooldown expires"
      );
    } else {
      log.warn(
        { sessionId, errorCount: count, threshold: REDIS_ERROR_THRESHOLD },
        "Redis error, will retry"
      );
    }
  }

  private async readSessionCostUncached(sessionId: string): Promise<number> {
    const redis = this.redis;
    if (redis && this.redisAvailableForSession(sessionId)) {
      try {
        const val = await redis.get(`${COST_KEY_PREFIX}${sessionId}`);
        if (val === null) {
          return 0;
        }
        const parsed = Number.parseFloat(val);
        if (!Number.isFinite(parsed)) {
          log.warn(
            { sessionId, rawValue: val },
            "Redis returned non-numeric cost value, falling back to 0"
          );
          return 0;
        }
        return parsed;
      } catch (error) {
        log.error(
          { err: error, sessionId },
          "Failed to get session cost from Redis"
        );
        this.recordRedisError(sessionId);
      }
    }

    return this.costs.get(sessionId) ?? 0;
  }

  /** @internal test seam — pre-seed cost without connecting to Redis */
  _seedCost(sessionId: string, cost: number): void {
    this.costs.set(sessionId, cost);
    this.hotCostReads.set(sessionId, { value: cost, readAt: Date.now() });
  }

  /**
   * Connect to Redis explicitly when running in production.
   * Not required for in-memory-only usage (tests, CI).
   */
  async connect(): Promise<void> {
    if (this.redis && !this.redis.status?.startsWith("ready")) {
      try {
        await this.redis.connect();
      } catch {
        log.warn("Failed to connect CostManager to Redis — using in-memory");
      }
    }
  }

  async recordCost(
    sessionId: string,
    promptTokens: number,
    completionTokens: number,
    model: string,
    options: RecordCostOptions = {}
  ): Promise<number> {
    if (promptTokens <= 0 && completionTokens <= 0) {
      return this.getSessionCost(sessionId);
    }

    const pricing = pricingForModel(model);
    const cost =
      (promptTokens * pricing.inputRate +
        completionTokens * pricing.outputRate) /
      1_000_000;

    const redis = this.redis;
    let total: number;
    if (redis && this.redisAvailableForSession(sessionId)) {
      try {
        const stored = await redis.incrbyfloat(
          `${COST_KEY_PREFIX}${sessionId}`,
          cost
        );
        log.info(
          {
            sessionId,
            promptTokens,
            completionTokens,
            model,
            cost,
            totalCost: Number(stored),
          },
          "Cost recorded"
        );
        const numTotal = Number(stored);
        this.costs.set(sessionId, numTotal);
        this.setHotCost(sessionId, numTotal);
        total = numTotal;
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to record cost to Redis");
        this.recordRedisError(sessionId);
        total = this.addInMemoryCost(sessionId, cost);
      }
    } else {
      total = this.addInMemoryCost(sessionId, cost);
    }

    if (options.trackAs) {
      await this.addTrackedCost(sessionId, options.trackAs, cost);
    }
    return total;
  }

  private addInMemoryCost(sessionId: string, cost: number): number {
    const current = this.costs.get(sessionId) ?? 0;
    const total = current + cost;
    this.costs.set(sessionId, total);
    this.setHotCost(sessionId, total);
    return total;
  }

  private async addTrackedCost(
    sessionId: string,
    track: string,
    cost: number
  ): Promise<void> {
    const key = `${sessionId}:${track}`;
    let tracks = this.sessionTracks.get(sessionId);
    if (!tracks) {
      tracks = new Set();
      this.sessionTracks.set(sessionId, tracks);
    }
    tracks.add(track);

    const redis = this.redis;
    if (redis && this.redisAvailableForSession(sessionId)) {
      try {
        const stored = await redis.incrbyfloat(
          `${COST_KEY_PREFIX}${key}`,
          cost
        );
        this.trackedCosts.set(key, Number(stored));
        return;
      } catch (error) {
        // Deliberately not recordRedisError: the main path already reflects
        // Redis health, and a tracked-only failure must not poison it.
        log.warn(
          { err: error, sessionId, track },
          "Failed to record tracked cost to Redis — using in-memory"
        );
      }
    }
    this.trackedCosts.set(key, (this.trackedCosts.get(key) ?? 0) + cost);
  }

  /**
   * Read a separately-tracked spend bucket (e.g. `tier2_speculative`).
   * Returns 0 when nothing was tracked yet.
   */
  async getTrackedCost(sessionId: string, track: string): Promise<number> {
    const key = `${sessionId}:${track}`;
    const redis = this.redis;
    if (redis && this.redisAvailableForSession(sessionId)) {
      try {
        const val = await redis.get(`${COST_KEY_PREFIX}${key}`);
        if (val !== null) {
          const parsed = Number.parseFloat(val);
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
      } catch {
        // Fall through to the in-memory mirror.
      }
    }
    return this.trackedCosts.get(key) ?? 0;
  }

  async getSessionCost(sessionId: string): Promise<number> {
    const cached = this.hotCacheValid(sessionId);
    if (cached !== undefined) {
      return cached;
    }

    const loaded = await this.readSessionCostUncached(sessionId);
    this.setHotCost(sessionId, loaded);
    return loaded;
  }

  isWarningMode(cost: number): boolean {
    return cost >= WARNING_THRESHOLD;
  }

  isHardCapReached(cost: number): boolean {
    return cost >= SESSION_COST_LIMIT;
  }

  async closeSession(sessionId: string): Promise<void> {
    const tracks = this.sessionTracks.get(sessionId);
    if (this.redis) {
      try {
        const keys = [`${COST_KEY_PREFIX}${sessionId}`];
        if (tracks) {
          for (const track of tracks) {
            keys.push(`${COST_KEY_PREFIX}${sessionId}:${track}`);
          }
        }
        await this.redis.del(...keys);
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to clear Redis cost");
      }
    }
    if (tracks) {
      for (const track of tracks) {
        this.trackedCosts.delete(`${sessionId}:${track}`);
      }
      this.sessionTracks.delete(sessionId);
    }
    this.costs.delete(sessionId);
    this.sessionRedisDisabled.delete(sessionId);
    this.sessionRedisErrors.delete(sessionId);
    this.hotCostReads.delete(sessionId);
  }
}
