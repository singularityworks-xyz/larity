import { describe, expect, it } from "bun:test";
import { CostManager } from "../../src/cost/manager";

describe("Cost Simulation Verification", () => {
  it("verifies 1-hour session cost stays under nominal target of $1.22 and hard cap $2.00", async () => {
    const costManager = new CostManager();
    const sessionId = "cost-sim-1hr";

    // Simulate 1 hour = 60 minutes
    // Average talking frequency: 15 utterances per minute per speaker
    // 2 speakers (host + 1 participant) -> 30 utterances / minute
    // Total utterances over 60 minutes: 1800
    const totalUtterances = 1800;

    // Simulate STT Cost (Deepgram Novafest 2) -> $0.0059 / min / channel
    // We assume 2 channels (host + desktop loopback mixed to 1 participant channel)
    const sttCostPerMin = 0.0059;
    const channels = 2;
    const sessionMinutes = 60;
    const sttTotalCost = sttCostPerMin * channels * sessionMinutes;

    // Feed the STT cost into the cost manager (we can mock it as tokens or inject directly)
    // For simplicity, we just inject it into the seeded cost
    costManager._seedCost(sessionId, sttTotalCost);

    // Simulate LLM Usage
    // Tier 2 runs on every utterance: ~50 prompt tokens, ~30 completion tokens
    for (let i = 0; i < totalUtterances; i++) {
      await costManager.recordCost(sessionId, 50, 30, "gemini-3.1-flash-lite");

      // Tier 4 runs on ~5% of utterances
      if (i % 20 === 0) {
        await costManager.recordCost(sessionId, 1000, 100, "gemini-pro");
      }
    }

    const finalCost = await costManager.getSessionCost(sessionId);

    // The nominal target from timeline is ~$1.22
    // STT: ~$0.708
    // LLM Tier 2: ~$0.1035
    // LLM Tier 4: ~$0.12375
    // Total roughly $0.935
    expect(finalCost).toBeGreaterThan(0.9);
    expect(finalCost).toBeLessThan(1.22);

    // Ensure it is safely below the $2.00 limit
    expect(costManager.isHardCapReached(finalCost)).toBe(false);

    // It shouldn't even reach the warning threshold ($1.60)
    expect(costManager.isWarningMode(finalCost)).toBe(false);
  });
});
