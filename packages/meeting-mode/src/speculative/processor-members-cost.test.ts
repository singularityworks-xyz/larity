import { describe, expect, test } from "bun:test";
import type { CostManager } from "../cost/manager";
import { SPECULATIVE_COST_TRACK } from "../cost/manager";
import { Tier1StructuralDetector } from "../pipeline/tier1";
import type { Tier2Classifier } from "../pipeline/tier2";
import type { Tier2Classification, Tier2Input } from "../pipeline/types";
import type { SpeakerIdentity } from "../utterance/types";
import { SpeculativeProcessor } from "./processor";
import type { PartialUtterance } from "./types";

const SESSION = "spec-members-test";

function makeSpeaker(): SpeakerIdentity {
  return {
    speakerId: "spk_1001",
    type: "TEAM",
    name: "Rahul",
    diarizationIndices: [1001],
    isCurrentUser: false,
    confidence: 1,
  };
}

function makeClassification(): Tier2Classification {
  return {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    extractedData: {},
    confidence: 0.9,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SpeculativeProcessor session members + tracked cost (P3.3)", () => {
  test("speculative Tier 2 receives session-cached members", async () => {
    const box: { input: Tier2Input | null } = { input: null };
    const tier2 = {
      classify: (input: Tier2Input) => {
        box.input = input;
        return Promise.resolve({
          classification: makeClassification(),
          promptTokens: 0,
          completionTokens: 0,
        });
      },
    } as unknown as Tier2Classifier;
    const members = [{ id: "c1", name: "Client One" }];
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
      getKnownClientMembers: (sessionId) =>
        sessionId === SESSION ? members : [],
    });

    const partial: PartialUtterance = {
      confidence: 0.95,
      sessionId: SESSION,
      speaker: makeSpeaker(),
      text: "we can deliver by friday afternoon",
      timestamp: Date.now(),
    };
    processor.processPartial(partial);
    await flush();

    expect(box.input).not.toBeNull();
    expect(box.input?.knownClientMembers).toEqual(members);
  });

  test("speculative cost records under the tier2_speculative track", async () => {
    const tier2 = {
      classify: () =>
        Promise.resolve({
          classification: makeClassification(),
          promptTokens: 50,
          completionTokens: 5,
        }),
    } as unknown as Tier2Classifier;
    const recordCalls: unknown[][] = [];
    const costManager = {
      recordCost: (...args: unknown[]) => {
        recordCalls.push(args);
        return Promise.resolve(0.01);
      },
    } as unknown as CostManager;
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
      costManager,
    });

    processor.processPartial({
      confidence: 0.95,
      sessionId: SESSION,
      speaker: makeSpeaker(),
      text: "we can deliver by friday afternoon",
      timestamp: Date.now(),
    });
    await flush();

    expect(recordCalls).toHaveLength(1);
    const [sessionId, prompt, completion, model, options] =
      recordCalls[0] ?? [];
    expect(sessionId).toBe(SESSION);
    expect(prompt).toBe(50);
    expect(completion).toBe(5);
    expect(model).toBe("gpt-oss-120b");
    expect(options).toMatchObject({ trackAs: SPECULATIVE_COST_TRACK });
  });
});
