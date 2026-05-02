import { describe, expect, it } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { hydrateTier4HistoricalMatches } from "../../src/pipeline/tier4-context";

function preload(sessionId = "sess"): PreloadedContextPayload {
  return {
    version: 1,
    sessionId,
    meetingId: "m",
    clientId: "c1",
    orgId: "o1",
    loadedAt: Date.now(),
    openDecisions: [
      {
        id: "dec-1",
        title: "Hosting",
        content: "Remain on GCP through Q4",
        tags: [],
        createdAt: Date.UTC(2025, 4, 1),
      },
    ],
    activePolicyGuardrails: [
      {
        id: "pol-1",
        name: "No surprise discounts",
        description: "Finance must approve >10% discounts.",
        ruleType: "finance",
        severity: "critical",
        keywords: [],
        pattern: null,
        clientId: null,
      },
    ],
    knownConstraints: [
      {
        id: "ip-legal",
        content: "Signed NDA expires 2026-06-01.",
        createdAt: Date.now(),
      },
    ],
    priorCommitments: [],
    clientNameList: [],
    keywordBlocklists: [],
    calendarAgendaItems: [],
  };
}

describe("pipeline/tier4-context hydrate", () => {
  it("hydrates historical decisions from preload", () => {
    const hydrated = hydrateTier4HistoricalMatches(preload(), [
      { type: "decision", id: "dec-1", score: 0.81 },
    ]);
    expect(hydrated).toHaveLength(1);
    expect(hydrated[0]?.item).toContain("Hosting");
    expect(hydrated[0]?.similarity).toBeCloseTo(0.81);
  });

  it("hydrates guardrails text", () => {
    const hydrated = hydrateTier4HistoricalMatches(preload(), [
      { type: "policy_guardrail", id: "pol-1", score: 0.75 },
    ]);
    expect(hydrated[0]?.item).toContain("Finance");
  });

  it("hydrates important points from knownConstraints", () => {
    const hydrated = hydrateTier4HistoricalMatches(preload(), [
      { type: "important_point", id: "ip-legal", score: 0.77 },
    ]);
    expect(hydrated[0]?.item).toContain("NDA");
  });

  it("falls back to placeholder when preload missing payload", () => {
    const hydrated = hydrateTier4HistoricalMatches(null, [
      { type: "decision", id: "ghost", score: 0.71 },
    ]);
    expect(hydrated[0]?.item).toContain("ghost");
    expect(hydrated[0]?.item).toContain("no preload");
  });
});
