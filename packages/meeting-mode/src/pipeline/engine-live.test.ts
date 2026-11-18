import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Alert } from "../alerts/types";
import type { Commitment } from "../commitment/types";
import { CostManager } from "../cost/manager";
import type { Utterance } from "../utterance/types";
import { MeetingPipelineEngine } from "./engine";
import type { LiveAnalysis, LiveAnalyzer } from "./live-analyzer";
import { getMetricsSnapshot, resetMetrics } from "./metrics";
import { PreFilter } from "./pre-filter";
import { Tier2Classifier, type Tier2InvokeResult } from "./tier2";
import { Tier3SearchEngine } from "./tier3";
import { Tier4DeepReasoner } from "./tier4";
import type { Tier4Context } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  expect(predicate()).toBe(true);
}

function utterance(
  index: number,
  text = `delivery milestone ${index} is now in June`
): Utterance {
  return {
    confidenceScore: 0.95,
    duration: 1,
    mergedCount: 1,
    sessionId: "live-test",
    speaker: {
      confidence: 1,
      diarizationIndices: [0],
      isCurrentUser: true,
      name: "Ada",
      speakerId: "spk_0",
      type: "TEAM",
      userId: "ada",
    },
    embedding: [1, 0],
    startOffset: index,
    text,
    timestamp: 1000 + index * 1000,
    utteranceId: `live-test:${index}`,
    wordCount: text.split(" ").length,
    topicId: "delivery",
  };
}

function analysis(): LiveAnalysis {
  return {
    classification: {
      intent: "commitment",
      commitmentType: "timeline",
      confidence: 0.95,
      tone: "hesitant",
      riskSignals: ["backtracking"],
      extractedData: {
        deadline: "June",
        amount: 4000,
        currency: "USD",
        quantity: 2,
        scope: "migration",
      },
      topicDelta: { labelHint: "Migration" },
    },
    response: {
      alertType: "self_contradiction",
      confidence: 0.95,
      message: "Delivery date changed",
      surfaceReason: "You previously promised May.",
      suggestion: "Confirm the revised deadline with the client.",
      severity: "high",
      reasoning: "May conflicts with June.",
      shouldSurface: true,
      routing: "personal",
      targetUserId: "ada",
    },
    promptTokens: 100,
    completionTokens: 50,
  };
}

function fixture(
  analyzer: LiveAnalyzer,
  history: Utterance[] = [],
  enrichment?: () => Promise<Tier2InvokeResult>
) {
  const alerts: Alert[] = [];
  const commits: string[] = [];
  const persisted: unknown[] = [];
  const contexts: Tier4Context[] = [];
  const costManager = new CostManager();
  const hydrate = mock(async () => null);
  const tier2Invoke = mock(() =>
    enrichment
      ? enrichment()
      : Promise.reject(new Error("sequential classifier invoked"))
  );
  const tier4Invoke = mock(() =>
    Promise.reject(new Error("sequential reasoner invoked"))
  );
  const tier3 = new Tier3SearchEngine();
  tier3.evaluate = mock(async () => ({
    forceTier4: true,
    noveltyScore: 0,
    ledgerMatches: [],
    memoryMatches: [
      {
        id: "org-rule",
        type: "policy_guardrail",
        score: 0.9,
        item: "Migration delivery is May",
      },
    ],
  }));
  const engine = new MeetingPipelineEngine({
    liveAnalyzer: {
      requiresClassification: analyzer.requiresClassification,
      analyze: (context, input, signal) => {
        contexts.push(context);
        return analyzer.analyze(context, input, signal);
      },
    },
    liveConcurrency: 2,
    costManager,
    tier3,
    tier2: new Tier2Classifier({ invoke: tier2Invoke }),
    tier4: new Tier4DeepReasoner({ invoke: tier4Invoke }),
    commitmentManager: {
      addCommitment: (_sessionId, input) => {
        persisted.push(input);
        return Promise.resolve(null);
      },
      getAll: () => [] as Commitment[],
      hydrateSession: hydrate,
      search: () => [],
    },
    constraintManager: {
      ensureHydrated: async () => undefined,
      getAll: () => [],
      processUtterance: async () => null,
    },
    finalizer: {
      applyTier2TopicDelta: (_sessionId, _topicId, delta) => {
        commits.push(delta.labelHint ?? "");
        return Promise.resolve();
      },
      getRecentEmbeddings: () => [],
      getRecentSameSpeakerText: () => [],
      getRecentUtterancesChronological: () => history,
    },
    getContextPayload: async () => null,
    getKnownClientMembers: async () => [{ id: "client-1", name: "Grace" }],
    tier4Alerts: {
      publish: (_sessionId, alert) => {
        alerts.push(alert);
        return Promise.resolve();
      },
    },
  });
  return {
    engine,
    alerts,
    commits,
    persisted,
    contexts,
    hydrate,
    tier2Invoke,
    tier4Invoke,
    costManager,
    tier3,
  };
}

describe("single-call live pipeline", () => {
  beforeEach(resetMetrics);

  test("retrieves org evidence before one analysis and preserves extraction fields", async () => {
    const f = fixture({
      analyze: (context, input) => {
        expect(context.matchedHistoricalItems[0]?.item).toBe(
          "Migration delivery is May"
        );
        expect(input.knownClientMembers?.[0]?.name).toBe("Grace");
        return Promise.resolve(analysis());
      },
    });
    const result = await f.engine.evaluateUtterance(utterance(0), {
      queuedAtMs: Date.now(),
    });
    expect(f.alerts).toHaveLength(1);
    expect(f.alerts[0]?.targetUserId).toBe("ada");
    expect(f.persisted[0]).toMatchObject({
      extractedData: {
        deadline: "June",
        amount: 4000,
        currency: "USD",
        quantity: 2,
        scope: ["migration"],
      },
    });
    expect(f.tier2Invoke).not.toHaveBeenCalled();
    expect(f.tier4Invoke).not.toHaveBeenCalled();
    expect(result.latencies.analysisMs).toBeDefined();
    expect(
      getMetricsSnapshot().histograms["pipeline.utterance_to_alert_ms"]?.count
    ).toBe(1);
  });

  test("a ready alert bypasses a slow earlier request; commits stay ordered and concurrency is bounded", async () => {
    const first = deferred<LiveAnalysis>();
    const second = deferred<LiveAnalysis>();
    let calls = 0;
    const f = fixture({
      analyze: () => {
        calls += 1;
        if (calls === 1) {
          return first.promise;
        }
        if (calls === 2) {
          return second.promise;
        }
        return Promise.resolve(analysis());
      },
    });
    for (let index = 0; index < 3; index++) {
      f.engine.evaluateUtteranceQueued(utterance(index));
    }
    await until(() => calls === 2);
    expect(f.hydrate).toHaveBeenCalledTimes(1);
    const secondResult = analysis();
    if (secondResult.classification) {
      secondResult.classification.topicDelta = { labelHint: "second" };
    }
    second.resolve(secondResult);
    await until(() => f.alerts.length === 1);
    expect(f.alerts[0]?.triggerUtteranceId).toBe("live-test:1");
    expect(f.commits).toEqual([]);
    expect(calls).toBe(2);
    const firstResult = analysis();
    if (firstResult.classification) {
      firstResult.classification.topicDelta = { labelHint: "first" };
    }
    first.resolve(firstResult);
    await f.engine.waitForIdle("live-test");
    expect(calls).toBe(3);
    expect(f.commits.slice(0, 2)).toEqual(["first", "second"]);
    expect(f.alerts).toHaveLength(3);
  });

  test("recent raw speech remains evidence before extraction; future and current lines are excluded", async () => {
    const earlier = utterance(0, "We promised the client delivery in May");
    const current = utterance(1);
    const later = utterance(2);
    const f = fixture({ analyze: async () => analysis() }, [
      earlier,
      current,
      later,
    ]);
    await f.engine.evaluateUtterance(current);
    expect(f.contexts[0]?.recentUtterances.map((u) => u.utteranceId)).toEqual([
      earlier.utteranceId,
    ]);
  });

  test("closing cancels active analysis and prevents late alerts or state writes", async () => {
    const pending = deferred<LiveAnalysis>();
    let signal: AbortSignal | undefined;
    const f = fixture({
      analyze: (_context, _input, abortSignal) => {
        signal = abortSignal;
        return pending.promise;
      },
    });
    f.engine.evaluateUtteranceQueued(utterance(0));
    await until(() => signal !== undefined);
    const idle = f.engine.waitForIdle("live-test");
    f.engine.closeSession("live-test");
    expect(signal?.aborted).toBe(true);
    pending.resolve(analysis());
    await idle;
    expect(f.alerts).toHaveLength(0);
    expect(f.persisted).toHaveLength(0);
  });

  test("closing after publication suppresses delayed enrichment writes", async () => {
    const pending = deferred<Tier2InvokeResult>();
    const f = fixture(
      {
        requiresClassification: true,
        analyze: async () => ({ ...analysis(), classification: null }),
      },
      [],
      () => pending.promise
    );
    f.engine.evaluateUtteranceQueued(utterance(0));
    await until(() => f.alerts.length === 1);
    const idle = f.engine.waitForIdle("live-test");
    f.engine.closeSession("live-test");
    pending.resolve({
      text: JSON.stringify(analysis().classification),
      promptTokens: 10,
      completionTokens: 5,
    });
    await idle;
    expect(f.persisted).toHaveLength(0);
    expect(f.commits).toHaveLength(0);
  });

  test("compact alerts publish before separate detailed extraction completes", async () => {
    const pending = deferred<Tier2InvokeResult>();
    const f = fixture(
      {
        requiresClassification: true,
        analyze: async () => ({ ...analysis(), classification: null }),
      },
      [],
      () => pending.promise
    );
    f.engine.evaluateUtteranceQueued(utterance(0));
    await until(() => f.alerts.length === 1);
    expect(f.persisted).toHaveLength(0);
    pending.resolve({
      text: JSON.stringify(analysis().classification),
      promptTokens: 10,
      completionTokens: 5,
    });
    await f.engine.waitForIdle("live-test");
    expect(f.persisted).toHaveLength(1);
    expect(f.persisted[0]).toMatchObject({
      extractedData: { deadline: "June", amount: 4000 },
    });
  });

  test("hard cost cap prevents analysis; low-confidence alerts remain suppressed", async () => {
    const invoke = mock(async () => analysis());
    const f = fixture({ analyze: invoke });
    f.costManager._seedCost("live-test", 2.01);
    await f.engine.evaluateUtterance(utterance(0));
    expect(invoke).not.toHaveBeenCalled();
    f.costManager._seedCost("live-test", 0);
    const low = analysis();
    if (low.response) {
      low.response.confidence = 0.1;
    }
    invoke.mockImplementation(async () => low);
    await f.engine.evaluateUtterance(utterance(1));
    expect(f.alerts).toHaveLength(0);
  });
});

describe("contradiction evidence prefilter", () => {
  test("preserves short corrections, Hindi and substantive acknowledgments", () => {
    const filter = new PreFilter();
    for (const [index, text] of [
      "not included",
      "$4000",
      "नहीं होगा",
      "okay but no",
      "no",
    ].entries()) {
      expect(filter.evaluate(utterance(index, text)).dropped).toBe(false);
    }
    expect(filter.evaluate(utterance(5, "okay")).dropped).toBe(true);
  });

  test("does not deduplicate changes in price, currency, decimal or negation", () => {
    const filter = new PreFilter();
    for (const [index, text] of [
      "The price is $4000",
      "The price is $8000",
      "The price is €8000",
      "Our rate is 1.5",
      "Our rate is 15",
      "We can deliver the migration",
      "We cannot deliver the migration",
    ].entries()) {
      expect(filter.evaluate(utterance(index, text)).dropped).toBe(false);
    }
    expect(filter.evaluate(utterance(8, "The price is $4000")).dropped).toBe(
      true
    );
  });
});
