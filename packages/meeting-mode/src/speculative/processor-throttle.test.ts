import { describe, expect, test } from "bun:test";
import { Tier1StructuralDetector } from "../pipeline/tier1";
import type { Tier2Classifier } from "../pipeline/tier2";
import type { Tier2Classification } from "../pipeline/types";
import type { SpeakerIdentity } from "../utterance/types";
import { SpeculativeProcessor } from "./processor";
import { SpeculationThrottle } from "./throttle";
import type { PartialUtterance } from "./types";

const SESSION = "spec-proc-test";

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

function makePartial(text: string): PartialUtterance {
  return {
    confidence: 0.95,
    sessionId: SESSION,
    speaker: makeSpeaker(),
    text,
    timestamp: Date.now(),
  };
}

/** Deferred promise so tests can hold a speculation in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SpeculativeProcessor throttle integration (P3.1)", () => {
  test("rapid partials fire a single Tier 2 call", async () => {
    let calls = 0;
    const tier2 = {
      classify: () => {
        calls += 1;
        return Promise.resolve({ classification: makeClassification() });
      },
    } as unknown as Tier2Classifier;
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    // Three growing partials in the same tick: only the first fires.
    processor.processPartial(makePartial("we can deliver"));
    processor.processPartial(makePartial("we can deliver by friday"));
    processor.processPartial(makePartial("we can deliver by friday afternoon"));
    await flush();

    expect(calls).toBe(1);
  });

  test("low-priority (EXTERNAL) partials never fire, even unthrottled", async () => {
    let calls = 0;
    const tier2 = {
      classify: () => {
        calls += 1;
        return Promise.resolve({ classification: makeClassification() });
      },
    } as unknown as Tier2Classifier;
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
    });

    const external: PartialUtterance = {
      ...makePartial("we can deliver by friday afternoon please"),
      speaker: { ...makeSpeaker(), type: "EXTERNAL" },
    };
    processor.processPartial(external);
    await flush();

    expect(calls).toBe(0);
  });

  test("in-flight prefix blocks a grown partial; settling unblocks it", async () => {
    const gate = deferred<{ classification: Tier2Classification }>();
    let calls = 0;
    const tier2 = {
      classify: () => {
        calls += 1;
        return gate.promise;
      },
    } as unknown as Tier2Classifier;
    // Pre-seed the throttle with an old speculation so only the in-flight
    // rule (not the 500 ms interval) decides.
    const throttle = new SpeculationThrottle();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
      throttle,
    });

    processor.processPartial(makePartial("we can deliver"));
    // Grown partial while the first speculation is in flight → blocked.
    processor.processPartial(
      makePartial("we can deliver by friday afternoon please surely")
    );
    await flush();
    expect(calls).toBe(1);

    // Settle, then age the throttle past the interval: the grown partial fires.
    gate.resolve({ classification: makeClassification() });
    await flush();
    throttle.markStarted(
      SESSION,
      "spk_1001",
      "we can deliver",
      Date.now() - 60_000
    );
    throttle.markSettled(SESSION, "spk_1001", "we can deliver");
    processor.processPartial(
      makePartial("we can deliver by friday afternoon please surely")
    );
    await flush();
    expect(calls).toBe(2);
  });

  test("a rejected speculation settles the throttle (no wedging)", async () => {
    const gate = deferred<{ classification: Tier2Classification }>();
    let calls = 0;
    const tier2 = {
      classify: () => {
        calls += 1;
        return gate.promise;
      },
    } as unknown as Tier2Classifier;
    const throttle = new SpeculationThrottle();
    const processor = new SpeculativeProcessor({
      tier1: new Tier1StructuralDetector(),
      tier2,
      throttle,
    });

    processor.processPartial(makePartial("we can deliver"));
    gate.reject(new Error("provider down"));
    await flush();
    expect(calls).toBe(1);

    // Throttle settled despite the failure: an aged, grown partial fires.
    throttle.markStarted(
      SESSION,
      "spk_1001",
      "we can deliver",
      Date.now() - 60_000
    );
    throttle.markSettled(SESSION, "spk_1001", "we can deliver");
    processor.processPartial(
      makePartial("we can deliver by friday afternoon please surely")
    );
    await flush();
    expect(calls).toBe(2);
  });
});
