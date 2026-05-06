import type Redis from "ioredis";
import { COST_CAP_CACHE_TTL_MS } from "../env";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("cost-manager");

const COST_KEY_PREFIX = "meeting:cost:";

const MODEL_PRICING: Record<string, { inputRate: number; outputRate: number }> =
  {
    "gemini-3.1-flash-lite-preview": { inputRate: 0.25, outputRate: 1.5 },
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

export class CostManager {
  private readonly redis: Redis | null;
  private readonly costs = new Map<string, number>();
  private readonly sessionRedisDisabled = new Map<string, boolean>();
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

  private async readSessionCostUncached(sessionId: string): Promise<number> {
    const redisDisabled = this.sessionRedisDisabled.get(sessionId) ?? false;

    if (this.redis && !redisDisabled) {
      try {
        const val = await this.redis.get(`${COST_KEY_PREFIX}${sessionId}`);
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
        this.sessionRedisDisabled.set(sessionId, true);
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

    const flashLitePricing = MODEL_PRICING["gemini-3.1-flash-lite-preview"];
    const pricing = MODEL_PRICING[model] ??
      flashLitePricing ?? { inputRate: 0.075, outputRate: 0.075 };
    const cost =
      (promptTokens * pricing.inputRate +
        completionTokens * pricing.outputRate) /
      1_000_000;

    // Check if Redis is disabled for this session
    const redisDisabled = this.sessionRedisDisabled.get(sessionId) ?? false;

    if (this.redis && !redisDisabled) {
      try {
        const total = await this.redis.incrbyfloat(
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
        // Mark Redis as disabled for this session
        this.sessionRedisDisabled.set(sessionId, true);
        // Fall through to in-memory tracking
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
    this.hotCostReads.delete(sessionId);
  }
}
