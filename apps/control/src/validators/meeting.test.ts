import { describe, expect, it } from "bun:test";
import {
  confirmSpeakerMappingSchema,
  createMeetingSchema,
  meetingExtractionSchema,
} from "./meeting";

describe("meeting validators", () => {
  it("defaults empty meeting title to 'Untitled meeting'", () => {
    const parsed = createMeetingSchema.parse({
      clientId: "123e4567-e89b-12d3-a456-426614174000",
      title: "   ",
    });
    expect(parsed.title).toBe("Untitled meeting");
  });

  it("trims meeting title when provided", () => {
    const parsed = createMeetingSchema.parse({
      clientId: "123e4567-e89b-12d3-a456-426614174000",
      title: "  Sprint Planning  ",
    });
    expect(parsed.title).toBe("Sprint Planning");
  });

  it("validates speaker mapping with deepgramIndex or index", () => {
    const validWithDeepgram = confirmSpeakerMappingSchema.safeParse({
      deepgramIndex: "0",
      clientMemberId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(validWithDeepgram.success).toBe(true);

    const validWithIndex = confirmSpeakerMappingSchema.safeParse({
      index: "1",
      clientMemberId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(validWithIndex.success).toBe(true);

    const invalid = confirmSpeakerMappingSchema.safeParse({
      clientMemberId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(invalid.success).toBe(false);
  });

  it("populates default collections in extraction schema", () => {
    const parsed = meetingExtractionSchema.parse({});
    expect(parsed.decisions).toEqual([]);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.openQuestions).toEqual([]);
    expect(parsed.importantPoints).toEqual([]);
  });
});
