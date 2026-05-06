import { describe, expect, it } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { PredictivePreloader } from "../../src/speculative/predictive-preloader";

function createPayload(
  overrides: Partial<PreloadedContextPayload> = {}
): PreloadedContextPayload {
  return {
    version: 1,
    sessionId: "test-session",
    meetingId: "meeting-1",
    clientId: "client-1",
    orgId: "org-1",
    loadedAt: Date.now(),
    openDecisions: [],
    knownConstraints: [],
    activePolicyGuardrails: [],
    priorCommitments: [],
    clientNameList: [],
    keywordBlocklists: [],
    calendarAgendaItems: [],
    ...overrides,
  };
}

describe("PredictivePreloader", () => {
  it("predicts pricing topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "We need to discuss the budget for Q3"
    );
    expect(topics).toContain("pricing");
  });

  it("predicts timeline topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "The deadline for delivery is approaching"
    );
    expect(topics).toContain("timeline");
  });

  it("predicts legal topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "This falls under the NDA compliance requirements"
    );
    expect(topics).toContain("legal");
  });

  it("predicts security topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "We have a security vulnerability in the system"
    );
    expect(topics).toContain("security");
  });

  it("predicts scope topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "The new feature requirements are expanding"
    );
    expect(topics).toContain("scope");
  });

  it("predicts resource topic from text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "We need more headcount for this project"
    );
    expect(topics).toContain("resource");
  });

  it("returns empty for neutral text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics("Nice weather today");
    expect(topics.length).toBe(0);
  });

  it("predicts multiple topics from mixed text", () => {
    const preloader = new PredictivePreloader();
    const topics = preloader.predictTopics(
      "The budget deadline for the security policy review"
    );
    expect(topics.length).toBeGreaterThanOrEqual(2);
  });

  it("seeds from context payload with policy guardrails", () => {
    const preloader = new PredictivePreloader();
    const payload = createPayload({
      activePolicyGuardrails: [
        {
          id: "gr-1",
          name: "NDA Policy",
          description: "Do not share confidential information",
          ruleType: "blocklist",
          severity: "high",
          keywords: ["confidential", "nda", "legal"],
          pattern: null,
          clientId: null,
        },
      ],
    });

    preloader.seedFromContext("test-session", payload);

    const constraints = preloader.prefetch("test-session", ["legal"]);
    expect(constraints.length).toBeGreaterThan(0);
    expect(constraints.some((c) => c.type === "policy")).toBe(true);
  });

  it("seeds from context payload with agenda items", () => {
    const preloader = new PredictivePreloader();
    const payload = createPayload({
      calendarAgendaItems: [
        "Q3 budget review and pricing discussion",
        "Security compliance deadline",
      ],
    });

    preloader.seedFromContext("test-session", payload);

    const constraints = preloader.prefetch("test-session", [
      "pricing",
      "security",
    ]);
    expect(constraints.length).toBeGreaterThan(0);
  });

  it("returns empty for unseeded session", () => {
    const preloader = new PredictivePreloader();
    const constraints = preloader.prefetch("unknown-session", ["pricing"]);
    expect(constraints.length).toBe(0);
  });

  it("getHotConstraints returns all seeded constraints", () => {
    const preloader = new PredictivePreloader();
    const payload = createPayload({
      activePolicyGuardrails: [
        {
          id: "gr-1",
          name: "Data Policy",
          description: "Protect data",
          ruleType: "blocklist",
          severity: "high",
          keywords: ["data", "security"],
          pattern: null,
          clientId: null,
        },
      ],
    });

    preloader.seedFromContext("test-session", payload);
    const hot = preloader.getHotConstraints("test-session");
    expect(hot.length).toBeGreaterThan(0);
  });

  it("closeSession removes session data", () => {
    const preloader = new PredictivePreloader();
    const payload = createPayload({
      calendarAgendaItems: ["Budget review"],
    });
    preloader.seedFromContext("test-session", payload);
    preloader.closeSession("test-session");

    const constraints = preloader.prefetch("test-session", ["pricing"]);
    expect(constraints.length).toBe(0);
  });

  it("closeAll clears everything", () => {
    const preloader = new PredictivePreloader();
    preloader.seedFromContext(
      "s1",
      createPayload({ calendarAgendaItems: ["Budget review"] })
    );
    preloader.seedFromContext(
      "s2",
      createPayload({ calendarAgendaItems: ["Security audit"] })
    );

    preloader.closeAll();
    expect(preloader.getHotConstraints("s1").length).toBe(0);
    expect(preloader.getHotConstraints("s2").length).toBe(0);
  });

  it("addConstraintToCache adds to existing topic", () => {
    const preloader = new PredictivePreloader();
    const payload = createPayload({
      calendarAgendaItems: ["Budget discussion"],
    });
    preloader.seedFromContext("test-session", payload);

    preloader.addConstraintToCache("test-session", "pricing", {
      id: "custom-1",
      type: "capacity",
      value: "Budget must not exceed $50k",
      source: "meeting",
      confidence: 0.9,
      topicIds: ["pricing"],
    });

    const constraints = preloader.prefetch("test-session", ["pricing"]);
    expect(constraints.some((c) => c.id === "custom-1")).toBe(true);
  });
});
