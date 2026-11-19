import { describe, expect, test } from "bun:test";
import {
  countNewWords,
  countWords,
  SPECULATIVE_THROTTLE_MIN_INTERVAL_MS,
  SPECULATIVE_THROTTLE_MIN_NEW_WORDS,
  SpeculationThrottle,
} from "./throttle";

const SESSION = "sess-1";
const SPEAKER = "spk_1";

describe("countWords", () => {
  test("counts whitespace-separated tokens", () => {
    expect(countWords("we can deliver by friday")).toBe(5);
  });

  test("blank text counts as zero", () => {
    expect(countWords("   ")).toBe(0);
    expect(countWords("")).toBe(0);
  });
});

describe("countNewWords", () => {
  test("prefix growth counts only the appended tail", () => {
    expect(countNewWords("we can deliver by friday", "we can")).toBe(3);
  });

  test("identical text counts as zero new words", () => {
    expect(countNewWords("we can deliver", "we can deliver")).toBe(0);
  });

  test("divergent revision counts its full length", () => {
    expect(countNewWords("the budget exploded today", "we can deliver")).toBe(
      4
    );
  });

  test("empty previous text counts the full current length", () => {
    expect(countNewWords("hello world test", "")).toBe(3);
  });
});

describe("SpeculationThrottle", () => {
  test("first speculation for a speaker is allowed", () => {
    const throttle = new SpeculationThrottle();
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday",
        1000
      )
    ).toBe(true);
  });

  test("blank text never speculates", () => {
    const throttle = new SpeculationThrottle();
    expect(throttle.shouldSpeculate(SESSION, SPEAKER, "   ", 1000)).toBe(false);
  });

  test("second speculation inside the interval is blocked", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver by friday", 1000);
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please now",
        1000 + SPECULATIVE_THROTTLE_MIN_INTERVAL_MS - 1
      )
    ).toBe(false);
  });

  test("fewer than 4 new words after the interval is blocked", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver by friday", 1000);
    // +3 words, well past the interval.
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please surely",
        1000 + SPECULATIVE_THROTTLE_MIN_INTERVAL_MS + 10_000
      )
    ).toBe(false);
  });

  test("4+ new words after the interval is allowed", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver by friday", 1000);
    // The in-flight speculation settled, so rule 3 no longer applies.
    throttle.markSettled(SESSION, SPEAKER, "we can deliver by friday");
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please surely now today",
        1000 + SPECULATIVE_THROTTLE_MIN_INTERVAL_MS
      )
    ).toBe(true);
    expect(SPECULATIVE_THROTTLE_MIN_NEW_WORDS).toBe(4);
  });

  test("in-flight prefix blocks even when time and words allow", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver", 0);
    // Long past the interval, many new words — but the in-flight text
    // ("we can deliver") is a prefix of the current partial.
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please surely now",
        60_000
      )
    ).toBe(false);
  });

  test("settling the in-flight speculation unblocks prefix growth", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver", 0);
    throttle.markSettled(SESSION, SPEAKER, "we can deliver");
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please surely now",
        60_000
      )
    ).toBe(true);
  });

  test("divergent text is not blocked by a non-prefix in-flight", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "the weather is nice today", 0);
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "we can deliver by friday afternoon please",
        60_000
      )
    ).toBe(true);
  });

  test("markSettled only clears the matching in-flight text", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "first partial text here", 0);
    // A newer speculation replaced the in-flight marker.
    throttle.markStarted(
      SESSION,
      SPEAKER,
      "first partial text here revised completely now",
      1000
    );
    // Settling the stale one must not clear the newer marker.
    throttle.markSettled(SESSION, SPEAKER, "first partial text here");
    expect(
      throttle.shouldSpeculate(
        SESSION,
        SPEAKER,
        "first partial text here revised completely now plus more words",
        60_000
      )
    ).toBe(false);
  });

  test("state is tracked per session+speaker", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver by friday", 1000);
    // A different speaker in the same session is unaffected.
    expect(
      throttle.shouldSpeculate(
        SESSION,
        "spk_2",
        "we can deliver by friday",
        1001
      )
    ).toBe(true);
    // The same speaker in a different session is unaffected.
    expect(
      throttle.shouldSpeculate(
        "sess-2",
        SPEAKER,
        "we can deliver by friday",
        1001
      )
    ).toBe(true);
  });

  test("closeSession clears that session only", () => {
    const throttle = new SpeculationThrottle();
    throttle.markStarted(SESSION, SPEAKER, "we can deliver by friday", 1000);
    throttle.markStarted("sess-2", SPEAKER, "we can deliver by friday", 1000);
    throttle.closeSession(SESSION);
    expect(
      throttle.shouldSpeculate(SESSION, SPEAKER, "anything at all here", 1001)
    ).toBe(true);
    expect(
      throttle.shouldSpeculate("sess-2", SPEAKER, "anything at all here", 1001)
    ).toBe(false);
  });
});
