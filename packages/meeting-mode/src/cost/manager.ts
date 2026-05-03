import Redis from "ioredis";
import { REDIS_URL } from "../env";
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
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? new Redis(REDIS_URL);
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
      log.error({ err: error, sessionId }, "Failed to record cost");
      return 0;
    }
  }

  async getSessionCost(sessionId: string): Promise<number> {
    try {
      const val = await this.redis.get(`${COST_KEY_PREFIX}${sessionId}`);
      return Number(val ?? 0);
    } catch (error) {
      log.error({ err: error, sessionId }, "Failed to get session cost");
      return 0;
    }
  }

  isWarningMode(cost: number): boolean {
    return cost >= WARNING_THRESHOLD;
  }

  isHardCapReached(cost: number): boolean {
    return cost >= SESSION_COST_LIMIT;
  }

  async closeSession(sessionId: string): Promise<void> {
    try {
      await this.redis.del(`${COST_KEY_PREFIX}${sessionId}`);
    } catch (error) {
      log.error({ err: error, sessionId }, "Failed to clear session cost");
    }
  }
}
