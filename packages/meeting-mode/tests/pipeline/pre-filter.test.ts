import { describe, expect, it } from "bun:test";
import { PreFilter } from "../../src/pipeline/pre-filter";
import { createTestUtterance } from "../helpers";

describe("pipeline/pre-filter", () => {
  it("drops utterances with fewer than three words", () => {
    const filter = new PreFilter();

    const decision = filter.evaluate(
      createTestUtterance({
        text: "Sure thing",
        sessionId: "s-1",
      })
    );

    expect(decision.dropped).toBe(true);
    expect(decision.reason).toBe("too_short");
  });

  it("drops pure acknowledgement phrases", () => {
    const filter = new PreFilter();

    const decision = filter.evaluate(
      createTestUtterance({
        text: "Yeah okay right",
        sessionId: "s-1",
      })
    );

    expect(decision.dropped).toBe(true);
    expect(decision.reason).toBe("acknowledgement");
  });

  it("drops near-duplicates from recent history", () => {
    const filter = new PreFilter();

    const first = filter.evaluate(
      createTestUtterance({
        sessionId: "s-1",
        text: "We will deliver this by next friday afternoon",
      })
    );

    const second = filter.evaluate(
      createTestUtterance({
        sessionId: "s-1",
        text: "We will deliver this by next friday afternon",
      })
    );

    expect(first.dropped).toBe(false);
    expect(second.dropped).toBe(true);
    expect(second.reason).toBe("near_duplicate");
  });

  it("keeps non-noise utterances and isolates by session", () => {
    const filter = new PreFilter();

    const sessionOneDecision = filter.evaluate(
      createTestUtterance({
        sessionId: "s-1",
        text: "Please confirm the migration rollback sequence",
      })
    );

    const sessionTwoDecision = filter.evaluate(
      createTestUtterance({
        sessionId: "s-2",
        text: "Please confirm the migration rollback sequence",
      })
    );

    expect(sessionOneDecision.dropped).toBe(false);
    expect(sessionTwoDecision.dropped).toBe(false);
  });
});
