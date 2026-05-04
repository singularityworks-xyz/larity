import type Redis from "ioredis";
import { createMeetingModeLogger } from "../logger";

const log = createMeetingModeLogger("cost-manager");

const COST_KEY_PREFIX = "meeting:cost:";

const MODEL_PRICING: Record<string, number> = {
  "gemini-3.1-flash-lite-preview": 0.075,
  "gemini-pro": 1.25,
};

const SESSION_COST_LIMIT = 2.0;
const WARNING_THRESHOLD = 1.6;

export class CostManager {
  private readonly redis: Redis | null;
  private readonly costs = new Map<string, number>();

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
    tokens: number,
    model: string
  ): Promise<number> {
    if (tokens <= 0) {
      return this.getSessionCost(sessionId);
    }

    const flashLitePrice = MODEL_PRICING["gemini-3.1-flash-lite-preview"];
    const pricePerToken =
      (MODEL_PRICING[model] ?? flashLitePrice ?? 0.075) / 1_000_000;
    const cost = tokens * pricePerToken;

    if (this.redis) {
      try {
        const total = await this.redis.incrbyfloat(
          `${COST_KEY_PREFIX}${sessionId}`,
          cost
        );
        log.info(
          { sessionId, tokens, model, cost, totalCost: Number(total) },
          "Cost recorded"
        );
        return Number(total);
      } catch (error) {
        log.error({ err: error, sessionId }, "Failed to record cost to Redis");
      }
    }

    const current = this.costs.get(sessionId) ?? 0;
    const total = current + cost;
    this.costs.set(sessionId, total);
    return total;
  }

  async getSessionCost(sessionId: string): Promise<number> {
    if (this.redis) {
      try {
        const val = await this.redis.get(`${COST_KEY_PREFIX}${sessionId}`);
        return Number(val ?? 0);
      } catch (error) {
        log.error(
          { err: error, sessionId },
          "Failed to get session cost from Redis"
        );
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
  }
}
