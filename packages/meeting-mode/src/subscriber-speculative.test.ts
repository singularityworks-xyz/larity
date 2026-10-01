import { describe, expect, test } from "bun:test";
import type { SttResult } from "../../stt/src/types";
import { SPECULATIVE_ENABLED } from "./env";
import type { MeetingPipelineEngine } from "./pipeline/engine";
import type { SpeakerIdentifier } from "./speaker/identifier";
import { dispatchSpeculativePartial } from "./subscriber";
import type { SpeakerIdentity } from "./utterance/types";

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

function makeResult(overrides: Partial<SttResult> = {}): SttResult {
  return {
    channel: 1,
    confidence: 0.95,
    diarizationIndex: 1001,
    duration: 1.2,
    isFinal: false,
    sessionId: "sess-spec",
    speechTimestamp: 1_700_000_000_000,
    start: 12.3,
    transcript: "we can deliver by friday afternoon",
    ts: 1_700_000_001_000,
    type: "stt_partial",
    ...overrides,
  };
}

function makeIdentifier(speaker: SpeakerIdentity): SpeakerIdentifier {
  let seenIndex = -1;
  let seenTs = -1;
  const fake = {
    identifySpeaker: (diarizationIndex: number, ts: number) => {
      seenIndex = diarizationIndex;
      seenTs = ts;
      return speaker;
    },
    __seen: () => ({ seenIndex, seenTs }),
  };
  return fake as unknown as SpeakerIdentifier;
}

function makeEngine(impl?: {
  onEvaluate?: (partial: unknown) => void;
  reject?: boolean;
}): { engine: MeetingPipelineEngine; calls: unknown[] } {
  const calls: unknown[] = [];
  const engine = {
    evaluatePartial: (partial: unknown) => {
      calls.push(partial);
      impl?.onEvaluate?.(partial);
      return impl?.reject
        ? Promise.reject(new Error("hydration failed"))
        : Promise.resolve();
    },
  };
  return { engine: engine as unknown as MeetingPipelineEngine, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("SPECULATIVE_ENABLED", () => {
  test("defaults off (P3.6 go/no-go requires measured data)", () => {
    expect(SPECULATIVE_ENABLED).toBe(false);
  });
});

describe("dispatchSpeculativePartial", () => {
  test("returns false and never calls the engine when disabled", () => {
    const { engine, calls } = makeEngine();
    const dispatched = dispatchSpeculativePartial(
      makeResult(),
      makeIdentifier(makeSpeaker()),
      engine,
      false
    );
    expect(dispatched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("returns false when no pipeline engine is registered", () => {
    const dispatched = dispatchSpeculativePartial(
      makeResult(),
      makeIdentifier(makeSpeaker()),
      null,
      true
    );
    expect(dispatched).toBe(false);
  });

  test("returns false on blank transcripts", () => {
    const { engine, calls } = makeEngine();
    const dispatched = dispatchSpeculativePartial(
      makeResult({ transcript: "   " }),
      makeIdentifier(makeSpeaker()),
      engine,
      true
    );
    expect(dispatched).toBe(false);
    expect(calls).toHaveLength(0);
  });

  test("dispatches speaker + text + confidence to evaluatePartial", async () => {
    const speaker = makeSpeaker();
    const identifier = makeIdentifier(speaker);
    const { engine, calls } = makeEngine();
    const result = makeResult();

    const dispatched = dispatchSpeculativePartial(
      result,
      identifier,
      engine,
      true
    );
    await flush();

    expect(dispatched).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      confidence: 0.95,
      sessionId: "sess-spec",
      speaker,
      text: "we can deliver by friday afternoon",
      timestamp: 1_700_000_000_000,
    });
  });

  test("engine rejection is swallowed (fire-and-forget)", async () => {
    const { engine, calls } = makeEngine({ reject: true });
    const dispatched = dispatchSpeculativePartial(
      makeResult(),
      makeIdentifier(makeSpeaker()),
      engine,
      true
    );
    await flush();

    expect(dispatched).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
