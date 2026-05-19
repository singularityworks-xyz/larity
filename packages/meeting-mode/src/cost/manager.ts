import type Redis from "ioredis";
import { COST_CAP_CACHE_TTL_MS } from "../env";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("cost-manager");

const COST_KEY_PREFIX = "meeting:cost:";

const MODEL_PRICING: Record<string, { inputRate: number; outputRate: number }> =
  {
    "gemini-3.1-flash-lite": { inputRate: 0.25, outputRate: 1.5 },
    "gemini-pro": { inputRate: 1.25, outputRate: 1.25 },
    "openai/gpt-oss-120b": { inputRate: 0.9, outputRate: 0.9 },
    "llama-3.3-70b": { inputRate: 0.85, outputRate: 1.2 },
    "llama3.1-8b": { inputRate: 0.1, outputRate: 0.1 },
  };

const SESSION_COST_LIMIT = 2.0;
const WARNING_THRESHOLD = 1.6;

export interface CostManagerOptions {
  /** TTL for hot-cache reads on `getSessionCost` */
  hotCacheTtlMs?: number;
}

const REDIS_ERROR_THRESHOLD = 3;
const REDIS_COOLDOWN_MS = 30_000;

export class CostManager {
  private readonly redis: Redis | null;
  private readonly costs = new Map<string, number>();
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
      return undefined;
    }
    if (Date.now() - row.readAt > this.hotCacheTtlMs) {
      return undefined;
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
    model: string
  ): Promise<number> {
    if (promptTokens <= 0 && completionTokens <= 0) {
      return this.getSessionCost(sessionId);
    }

    const flashLitePricing = MODEL_PRICING["gemini-3.1-flash-lite"];
    const pricing = MODEL_PRICING[model] ??
      flashLitePricing ?? { inputRate: 0.075, outputRate: 0.075 };
    const cost =
      (promptTokens * pricing.inputRate +
        completionTokens * pricing.outputRate) /
      1_000_000;

    const redis = this.redis;
    if (redis && this.redisAvailableForSession(sessionId)) {
      try {
        const total = await redis.incrbyfloat(
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
            totalCost: Number(total),
          },
          "Cost recorded"
        );
        const numTotal = Number(total);
        this.costs.set(sessionId, numTotal);
        this.setHotCost(sessionId, numTotal);
        return numTotal;
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to record cost to Redis");
        this.recordRedisError(sessionId);
      }
    }

    const current = this.costs.get(sessionId) ?? 0;
    const total = current + cost;
    this.costs.set(sessionId, total);
    this.setHotCost(sessionId, total);
    return total;
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
    if (this.redis) {
      try {
        await this.redis.del(`${COST_KEY_PREFIX}${sessionId}`);
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to clear Redis cost");
      }
    }
    this.costs.delete(sessionId);
    this.sessionRedisDisabled.delete(sessionId);
    this.sessionRedisErrors.delete(sessionId);
    this.hotCostReads.delete(sessionId);
  }
}
