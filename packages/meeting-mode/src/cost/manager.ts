import type Redis from "ioredis";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("cost-manager");

const COST_KEY_PREFIX = "meeting:cost:";

const MODEL_PRICING: Record<string, { inputRate: number; outputRate: number }> =
  {
    "gemini-3.1-flash-lite-preview": { inputRate: 0.25, outputRate: 1.5 },
    "gemini-pro": { inputRate: 1.25, outputRate: 1.25 },
  };

const SESSION_COST_LIMIT = 2.0;
const WARNING_THRESHOLD = 1.6;

export class CostManager {
  private readonly redis: Redis | null;
  private readonly costs = new Map<string, number>();
  private readonly sessionRedisDisabled = new Map<string, boolean>();

  constructor(redis?: Redis) {
    this.redis = redis ?? null;
  }

  /** @internal test seam — pre-seed cost without connecting to Redis */
  _seedCost(sessionId: string, cost: number): void {
    this.costs.set(sessionId, cost);
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
        return Number(total);
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
    return total;
  }

  async getSessionCost(sessionId: string): Promise<number> {
    // Check if Redis is disabled for this session
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
        // Mark Redis as disabled for this session
        this.sessionRedisDisabled.set(sessionId, true);
        // Fall through to in-memory tracking
      }
    }

    return this.costs.get(sessionId) ?? 0;
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
  }
}
