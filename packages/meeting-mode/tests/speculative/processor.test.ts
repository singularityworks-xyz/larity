import { describe, expect, it, vi } from "bun:test";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import type { Tier2Classifier } from "../../src/pipeline/tier2";
import type {
  Tier2Classification,
  Tier2Outcome,
} from "../../src/pipeline/types";
import {
  hasHighSignalKeywords,
  SpeculativeProcessor,
} from "../../src/speculative/processor";
import type { PartialUtterance } from "../../src/speculative/types";
import {
  createExternalSpeaker,
  createTeamSpeaker,
  createTestSpeaker,
} from "../helpers";

function createMockTier2(
  classification: Tier2Classification = {
    intent: "general",
    commitmentType: null,
    tone: "neutral",
    riskSignals: [],
    extractedData: {},
    confidence: 0.8,
  }
): Tier2Classifier {
  return {
    classify: vi.fn().mockResolvedValue({
      classification,
      shouldStopForDeepReasoning: false,
      promptTokens: 10,
      completionTokens: 20,
    } satisfies Tier2Outcome),
  } as unknown as Tier2Classifier;
}

function createPartial(
  overrides: Partial<PartialUtterance> = {}
): PartialUtterance {
  return {
    sessionId: "test-session",
    speaker: createTeamSpeaker("user-1", "Alice"),
    text: "We can deliver this by Friday",
    confidence: 0.85,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("SpeculativeProcessor", () => {
  it("processes partials with confidence above threshold", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({ confidence: 0.85 });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    const match = processor.matchSpeculation(
      "test-session",
      "We can deliver this by Friday afternoon"
    );
    expect(match.mismatchRatio).toBeLessThan(0.3);
  });

  it("skips partials with confidence below threshold", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({ confidence: 0.5 });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    expect((tier2.classify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      0
    );
  });

  it("skips EXTERNAL speaker partials (low priority)", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({
      speaker: createExternalSpeaker("Client"),
      confidence: 0.85,
    });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    expect((tier2.classify as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      0
    );
  });

  it("processes TEAM speaker partials (standard priority)", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({
      speaker: createTeamSpeaker("user-2", "Bob", { isCurrentUser: false }),
      confidence: 0.85,
    });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    expect(
      (tier2.classify as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThanOrEqual(1);
  });

  it("processes current user partials (high priority)", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({
      speaker: createTestSpeaker({
        type: "TEAM",
        userId: "user-1",
        name: "Self",
        isCurrentUser: true,
      }),
      confidence: 0.75,
    });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    expect(
      (tier2.classify as ReturnType<typeof vi.fn>).mock.calls.length
    ).toBeGreaterThanOrEqual(1);
  });

  it("caches high-signal Tier 1 hits without invoking Tier 2", async () => {
    const tier2 = createMockTier2();
    const tier1 = new Tier1StructuralDetector();
    tier1.seedContext("test-session", {
      keywordBlocklists: ["confidential"],
      clientNameList: [],
    });

    const processor = new SpeculativeProcessor({
      tier1,
      tier2,
    });

    const partial = createPartial({
      text: "The confidential document is ready",
      confidence: 0.85,
    });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    const match = processor.matchSpeculation(
      "test-session",
      "The confidential document is ready"
    );
    expect(match.matched).toBe(true);
    expect(match.result?.tier1Result.blocklistHit).toBe(true);
  });

  it("matches speculation on final utterance text", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({ text: "We will ship by March" });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    const match = processor.matchSpeculation(
      "test-session",
      "We will ship by March 15th"
    );
    expect(match.matched).toBe(true);
  });

  it("discards speculation on text mismatch", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({ text: "Nice weather today" });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    const match = processor.matchSpeculation(
      "test-session",
      "The quarterly financial report shows significant budget overruns in the cloud infrastructure division"
    );
    expect(match.matched).toBe(false);
  });

  it("closeSession cleans up session data", async () => {
    const tier2 = createMockTier2();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const partial = createPartial({ text: "We can deliver this" });
    processor.processPartial(partial);

    await new Promise((r) => setTimeout(r, 50));

    processor.closeSession("test-session");
    const match = processor.matchSpeculation(
      "test-session",
      "We can deliver this"
    );
    expect(match.matched).toBe(false);
  });
});

describe("hasHighSignalKeywords", () => {
  it("detects commitment keywords", () => {
    expect(hasHighSignalKeywords("We commit to the deadline")).toBe(true);
  });

  it("detects security keywords", () => {
    expect(hasHighSignalKeywords("The security policy is violated")).toBe(true);
  });

  it("detects NDA keyword", () => {
    expect(hasHighSignalKeywords("This falls under the NDA")).toBe(true);
  });

  it("returns false for neutral text", () => {
    expect(hasHighSignalKeywords("The weather is nice today")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(hasHighSignalKeywords("We COMMIT to this")).toBe(true);
  });
});
