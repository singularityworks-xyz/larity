import { describe, expect, it } from "bun:test";
import type { PreloadedContextPayload } from "../../src/constraint/types";
import { Tier1StructuralDetector } from "../../src/pipeline/tier1";
import { createTestUtterance } from "../helpers";

const sessionId = "tier1-session";

function createContextPayload(): PreloadedContextPayload {
  return {
    version: 1,
    sessionId,
    meetingId: "meeting-1",
    clientId: "client-1",
    orgId: "org-1",
    loadedAt: Date.now(),
    openDecisions: [],
    knownConstraints: [],
    activePolicyGuardrails: [],
    priorCommitments: [],
    clientNameList: ["Acme Corp", "Anita Singh"],
    keywordBlocklists: ["internal roadmap", "pricing strategy"],
    calendarAgendaItems: [],
  };
}

describe("pipeline/tier1", () => {
  it("extracts date/time and numeric detections", () => {
    const detector = new Tier1StructuralDetector();
    detector.seedContext(sessionId, createContextPayload());

    const result = detector.detect(
      createTestUtterance({
        sessionId,
        text: "Delivery is due on 05/30/2026 at 13:30 with budget $1200 and 60% capacity.",
      })
    );

    expect(result.detections.some((d) => d.type === "date_time")).toBe(true);
    expect(result.detections.some((d) => d.type === "number")).toBe(true);
  });

  it("matches blocklist and client names with fuzzy support", () => {
    const detector = new Tier1StructuralDetector();
    detector.seedContext(sessionId, createContextPayload());

    const result = detector.detect(
      createTestUtterance({
        sessionId,
        text: "Please do not mention internl roadmap details to acme corp on this call.",
      })
    );

    expect(result.blocklistHit).toBe(true);
    expect(result.detections.some((d) => d.type === "blocklist_keyword")).toBe(
      true
    );
    expect(result.detections.some((d) => d.type === "client_name")).toBe(true);
  });

  it("detects technical leakage patterns", () => {
    const detector = new Tier1StructuralDetector();

    const result = detector.detect(
      createTestUtterance({
        sessionId,
        text: "The key is sk_live_abcdefghijklmnopqrstuv and password=supersecret42",
      })
    );

    expect(result.technicalHit).toBe(true);
    expect(result.detections.some((d) => d.type === "technical_pattern")).toBe(
      true
    );
  });
});
