import { describe, expect, mock, test } from "bun:test";
import type { PreloadedContextPayload } from "../constraint/types";
import type { Utterance } from "../utterance/types";
import { Tier3SearchEngine } from "./tier3";
import { hydrateTier4HistoricalMatches } from "./tier4-context";

const payload: PreloadedContextPayload = {
  version: 1,
  sessionId: "s",
  meetingId: "m",
  orgId: "org",
  clientId: "client",
  loadedAt: 0,
  openDecisions: [],
  knownConstraints: [],
  priorCommitments: [],
  activePolicyGuardrails: [],
  calendarAgendaItems: [],
  clientNameList: [],
  keywordBlocklists: [],
};

describe("organization evidence retrieval", () => {
  test("a single database query returns usable evidence outside the preload", async () => {
    const rows = [
      {
        type: "decision",
        id: "not-preloaded",
        item: "Approved budget: USD 4000",
        score: 0.91,
      },
    ];
    const query = mock(() => Promise.resolve(rows));
    const result = await new Tier3SearchEngine({ queryMemory: query }).evaluate(
      { embedding: [1, 0], sessionId: "s" } as Utterance,
      payload,
      { search: () => [] },
      []
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(result.forceTier4).toBe(true);
    expect(
      hydrateTier4HistoricalMatches(payload, result.memoryMatches)[0]?.item
    ).toBe("Approved budget: USD 4000");
  });
});
