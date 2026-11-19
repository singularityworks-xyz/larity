import { describe, expect, test } from "bun:test";
import {
  GEMINI_TIER4_MODEL,
  GENERALCOMPUTE_BASE_URL,
  GENERALCOMPUTE_TIER2_TIMEOUT_MS,
  LIVE_PIPELINE_CONCURRENCY,
  MEETING_PIPELINE_MODE,
  MERGE_GROUPING_MS,
  MERGE_PUBLISH_GAP_MS,
  PIPELINE_TRACE_PRETTY_JSON,
  TIER2_REASONING_EFFORT,
} from "./env";

describe("meeting-mode env defaults", () => {
  test("experimental live analysis stays opt-in with bounded overlap", () => {
    expect(MEETING_PIPELINE_MODE).toBe("legacy");
    expect(LIVE_PIPELINE_CONCURRENCY).toBe(2);
  });
  test("merger publish gap stays short (P2.3)", () => {
    expect(process.env.MERGE_PUBLISH_GAP_MS).toBeUndefined();
    expect(MERGE_PUBLISH_GAP_MS).toBe(250);
    expect(MERGE_GROUPING_MS).toBe(5000);
  });

  test("Tier 2 timeout caps FIFO head-of-line blocking (P2.7)", () => {
    expect(process.env.GENERALCOMPUTE_TIER2_TIMEOUT_MS).toBeUndefined();
    expect(GENERALCOMPUTE_TIER2_TIMEOUT_MS).toBe(3000);
  });

  test("pretty pipeline traces default off (P2.14)", () => {
    expect(process.env.PIPELINE_TRACE_PRETTY_JSON).toBeUndefined();
    expect(PIPELINE_TRACE_PRETTY_JSON).toBe(false);
  });

  test("Tier 2 provider URL defaults to General Compute", () => {
    expect(process.env.GENERALCOMPUTE_BASE_URL).toBeUndefined();
    expect(GENERALCOMPUTE_BASE_URL).toBe("https://api.generalcompute.com/v1");
  });

  test("Tier 2 reasoning effort defaults to low", () => {
    expect(process.env.TIER2_REASONING_EFFORT).toBeUndefined();
    expect(TIER2_REASONING_EFFORT).toBe("low");
  });

  test("Tier 4 defaults to gemini-3.5-flash-lite", () => {
    expect(process.env.GEMINI_TIER4_MODEL).toBeUndefined();
    expect(GEMINI_TIER4_MODEL).toBe("gemini-3.5-flash-lite");
  });
});
