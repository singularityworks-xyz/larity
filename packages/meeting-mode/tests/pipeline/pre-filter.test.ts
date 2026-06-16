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

  it("handles echo bleed duplicate when mic bleed (USER) arrives first, then loopback (EXTERNAL) arrives", () => {
    const filter = new PreFilter();
    const sessionId = "s-1";
    const text1 = "We will deliver this by next friday afternoon";
    const text2 = "We will deliver this by next friday afternon";
    const baseTime = Date.now();

    const u1 = createTestUtterance({
      sessionId,
      text: text1,
      speaker: {
        speakerId: "spk_0",
        type: "TEAM",
        name: "User",
        diarizationIndices: [0],
        isCurrentUser: true,
        confidence: 0.95,
      },
      timestamp: baseTime,
    });
    const first = filter.evaluate(u1);

    const u2 = createTestUtterance({
      sessionId,
      text: text2,
      speaker: {
        speakerId: "spk_1",
        type: "EXTERNAL",
        name: "Client",
        diarizationIndices: [1],
        isCurrentUser: false,
        confidence: 0.8,
      },
      timestamp: baseTime + 500, // 0.5s later
    });
    const second = filter.evaluate(u2);

    expect(first.dropped).toBe(false);
    expect(second.dropped).toBe(false); // Loopback is kept!
    expect(second.retractUtteranceId).toBe(u1.utteranceId); // Mic bleed retracted!
  });

  it("handles echo bleed duplicate when loopback (EXTERNAL) arrives first, then mic bleed (USER) arrives", () => {
    const filter = new PreFilter();
    const sessionId = "s-1";
    const text1 = "We will deliver this by next friday afternoon";
    const text2 = "We will deliver this by next friday afternon";
    const baseTime = Date.now();

    const u1 = createTestUtterance({
      sessionId,
      text: text1,
      speaker: {
        speakerId: "spk_1",
        type: "EXTERNAL",
        name: "Client",
        diarizationIndices: [1],
        isCurrentUser: false,
        confidence: 0.8,
      },
      timestamp: baseTime,
    });
    const first = filter.evaluate(u1);

    const u2 = createTestUtterance({
      sessionId,
      text: text2,
      speaker: {
        speakerId: "spk_0",
        type: "TEAM",
        name: "User",
        diarizationIndices: [0],
        isCurrentUser: true,
        confidence: 0.95,
      },
      timestamp: baseTime + 500, // 0.5s later
    });
    const second = filter.evaluate(u2);

    expect(first.dropped).toBe(false);
    expect(second.dropped).toBe(true); // Mic bleed is dropped!
    expect(second.reason).toBe("near_duplicate");
    expect(second.retractUtteranceId).toBe(u2.utteranceId); // Mic bleed retracted!
  });

  it("treats duplicates as standard near-duplicates if speaker types differ but time difference is > 5s", () => {
    const filter = new PreFilter();
    const sessionId = "s-1";
    const text1 = "We will deliver this by next friday afternoon";
    const text2 = "We will deliver this by next friday afternon";
    const baseTime = Date.now();

    const first = filter.evaluate(
      createTestUtterance({
        sessionId,
        text: text1,
        speaker: {
          speakerId: "spk_0",
          type: "TEAM",
          name: "User",
          diarizationIndices: [0],
          isCurrentUser: true,
          confidence: 0.95,
        },
        timestamp: baseTime,
      })
    );

    const second = filter.evaluate(
      createTestUtterance({
        sessionId,
        text: text2,
        speaker: {
          speakerId: "spk_1",
          type: "EXTERNAL",
          name: "Client",
          diarizationIndices: [1],
          isCurrentUser: false,
          confidence: 0.8,
        },
        timestamp: baseTime + 6000, // 6s later
      })
    );

    expect(first.dropped).toBe(false);
    expect(second.dropped).toBe(true); // Dropped as standard duplicate because > 5s
    expect(second.reason).toBe("near_duplicate");
    expect(second.retractUtteranceId).toBeUndefined();
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
