import { describe, expect, it } from "vitest";
import {
  createUnidentifiedSpeaker,
  type SpeakerIdentity,
  type SpeakerType,
} from "../../src/utterance/types";

describe("SpeakerType", () => {
  it("should accept TEAM as a valid SpeakerType", () => {
    const t: SpeakerType = "TEAM";
    expect(t).toBe("TEAM");
  });

  it("should accept EXTERNAL as a valid SpeakerType", () => {
    const t: SpeakerType = "EXTERNAL";
    expect(t).toBe("EXTERNAL");
  });
});

describe("SpeakerIdentity", () => {
  it("should conform to the interface shape", () => {
    const speaker: SpeakerIdentity = {
      speakerId: "spk_0",
      type: "TEAM",
      userId: "user-abc",
      name: "Alice",
      diarizationIndex: 0,
      isCurrentUser: true,
      confidence: 0.95,
    };

    expect(speaker.speakerId).toBe("spk_0");
    expect(speaker.type).toBe("TEAM");
    expect(speaker.userId).toBe("user-abc");
    expect(speaker.name).toBe("Alice");
    expect(speaker.diarizationIndex).toBe(0);
    expect(speaker.isCurrentUser).toBe(true);
    expect(speaker.confidence).toBe(0.95);
  });

  it("should allow optional userId to be undefined", () => {
    const speaker: SpeakerIdentity = {
      speakerId: "spk_1",
      type: "EXTERNAL",
      name: "Speaker 2",
      diarizationIndex: 1,
      isCurrentUser: false,
      confidence: 0,
    };

    expect(speaker.userId).toBeUndefined();
  });

  it("should allow optional diarizationIndex to be undefined", () => {
    const speaker: SpeakerIdentity = {
      speakerId: "spk_resolved",
      type: "TEAM",
      userId: "user-123",
      name: "Bob",
      isCurrentUser: false,
      confidence: 0.9,
    };

    expect(speaker.diarizationIndex).toBeUndefined();
  });
});

describe("createUnidentifiedSpeaker", () => {
  it("should create a speaker with correct speakerId format", () => {
    const speaker = createUnidentifiedSpeaker(0);
    expect(speaker.speakerId).toBe("spk_0");
  });

  it("should create a speaker with correct speakerId for higher indices", () => {
    const speaker = createUnidentifiedSpeaker(3);
    expect(speaker.speakerId).toBe("spk_3");
  });

  it("should default to EXTERNAL type", () => {
    const speaker = createUnidentifiedSpeaker(0);
    expect(speaker.type).toBe("EXTERNAL");
  });

  it("should set confidence to 0", () => {
    const speaker = createUnidentifiedSpeaker(0);
    expect(speaker.confidence).toBe(0);
  });

  it("should set isCurrentUser to false", () => {
    const speaker = createUnidentifiedSpeaker(0);
    expect(speaker.isCurrentUser).toBe(false);
  });

  it("should format name as 'Speaker N+1'", () => {
    expect(createUnidentifiedSpeaker(0).name).toBe("Speaker 1");
    expect(createUnidentifiedSpeaker(1).name).toBe("Speaker 2");
    expect(createUnidentifiedSpeaker(4).name).toBe("Speaker 5");
  });

  it("should store the diarizationIndex", () => {
    const speaker = createUnidentifiedSpeaker(2);
    expect(speaker.diarizationIndex).toBe(2);
  });

  it("should not include userId", () => {
    const speaker = createUnidentifiedSpeaker(0);
    expect(speaker.userId).toBeUndefined();
  });

  it("should return a complete SpeakerIdentity", () => {
    const speaker = createUnidentifiedSpeaker(1);
    expect(speaker).toEqual({
      speakerId: "spk_1",
      type: "EXTERNAL",
      name: "Speaker 2",
      diarizationIndex: 1,
      isCurrentUser: false,
      confidence: 0,
    });
  });
});
