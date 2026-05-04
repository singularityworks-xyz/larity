import { describe, expect, it } from "bun:test";
import { checkUndiscussedAgenda } from "../../src/speaker-state/agenda-checker";

describe("checkUndiscussedAgenda", () => {
  it("returns null when no agenda items", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["Budget", "Timeline"],
      agendaItems: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when all agenda items are discussed", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["Budget Review", "Timeline Planning"],
      agendaItems: ["Budget", "Timeline"],
    });
    expect(result).toBeNull();
  });

  it("fires alert for undiscussed agenda items", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["Budget Review"],
      agendaItems: ["Budget", "Security Review", "Timeline"],
    });
    expect(result).not.toBeNull();
    expect(result?.category).toBe("undiscussed_agenda");
    expect(result?.message).toContain("Security Review");
    expect(result?.message).toContain("Timeline");
  });

  it("fires medium severity for single missing item", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["Budget Review"],
      agendaItems: ["Budget", "Security"],
    });
    expect(result?.severity).toBe("medium");
  });

  it("fires high severity for multiple missing items", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["Budget Review"],
      agendaItems: ["Budget", "Security", "Timeline", "QA"],
    });
    expect(result?.severity).toBe("high");
  });

  it("matches agenda items case-insensitively", () => {
    const result = checkUndiscussedAgenda({
      discussedTopicLabels: ["budget review"],
      agendaItems: ["Budget"],
    });
    expect(result).toBeNull();
  });
});
