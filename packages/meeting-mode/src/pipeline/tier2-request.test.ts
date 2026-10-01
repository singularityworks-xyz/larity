import { describe, expect, test } from "bun:test";
import { buildTier2Request } from "./tier2";
import type { Tier2Input } from "./types";

function makeInput(): Tier2Input {
  return {
    utterance: "we will deliver by friday",
    speaker: {
      confidence: 1,
      diarizationIndices: [1001],
      isCurrentUser: false,
      name: "Rahul",
      speakerId: "spk_1001",
      type: "TEAM",
    },
    recentSameSpeaker: [],
    topicLabel: undefined,
    knownClientMembers: [],
  };
}

/**
 * Tier 2 provider contract (General Compute). Changing provider, model,
 * reasoning effort, or schema strictness must be deliberate and measured —
 * these assertions are the guard.
 */
describe("Tier 2 request contract", () => {
  test("targets General Compute gpt-oss-120b with reasoning low", () => {
    const request = buildTier2Request(makeInput());
    // Env default; override via GENERALCOMPUTE_TIER2_MODEL.
    expect(request.model).toBe("gpt-oss-120b");
    // Classification, not deep reasoning (TIER2_REASONING_EFFORT default low).
    expect(request.reasoning_effort).toBe("low");
    expect(request.temperature).toBe(0);
    // Reconnection is an SDK client option (`maxRetries: 0`), never a body
    // field — strict providers reject unknown JSON body keys.
    expect("reconnectAttempts" in request).toBe(false);
  });

  test("uses strict json_schema with a system + user turn", () => {
    const request = buildTier2Request(makeInput());
    const format = request.response_format as {
      type: string;
      json_schema: { name: string; strict: boolean; schema: unknown };
    };
    expect(format.type).toBe("json_schema");
    expect(format.json_schema.strict).toBe(true);
    expect(format.json_schema.name).toBe("Tier2Classification");
    expect(format.json_schema.schema).toBeDefined();

    const messages = request.messages as Array<{
      role: string;
      content: string;
    }>;
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe("system");
    expect(messages[1]?.role).toBe("user");
    expect(messages[1]?.content).toContain("we will deliver by friday");
  });
});
