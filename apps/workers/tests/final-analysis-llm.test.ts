import { afterEach, describe, expect, it, mock } from "bun:test";
import { generateMeetingAnalysis } from "../src/lib/final-analysis-llm";
import { ai } from "../src/lib/gemini";

const originalGenerateContent = ai.models.generateContent;

describe("generateMeetingAnalysis", () => {
  afterEach(() => {
    ai.models.generateContent = originalGenerateContent;
  });

  it("should successfully synthesize analysis using mock Gemini response", async () => {
    const mockResponse = {
      purpose: "Define the implementation timeline.",
      outcome: "Approved the plan.",
      prose: "A detailed paragraph summarizing what happened.",
      tone: "POSITIVE",
      clientSentiment: "ENTHUSIASTIC",
      keyMoments: [
        {
          timestamp: 45,
          description: "Richard agreed to plan",
          category: "DECISION",
        },
      ],
    };

    ai.models.generateContent = mock().mockResolvedValue({
      text: JSON.stringify(mockResponse),
    }) as any;

    const input = {
      meetingTitle: "Weekly Alignment",
      clientName: "Everline",
      participants: [
        { name: "Aman", role: "TEAM_MEMBER" as const },
        { name: "Richard Sterling", role: "EXTERNAL" as const },
      ],
      decisions: [
        {
          title: "Timeline approval",
          content: "We approved the timeline.",
          tags: ["timeline"],
          evidence:
            "[Richard Sterling]: Let's go ahead with the proposed schedule.",
        },
      ],
      tasks: [],
      openQuestions: [],
      importantPoints: [],
      talkTimeStats: {
        Aman: { utteranceCount: 5, totalSeconds: 50, talkTimePercent: 50 },
        "Richard Sterling": {
          utteranceCount: 5,
          totalSeconds: 50,
          talkTimePercent: 50,
        },
      },
      durationSeconds: 100,
      utterances: [
        { speaker: "Aman", text: "Hello", timestamp: 10 },
        {
          speaker: "Richard Sterling",
          text: "Let's go ahead with the proposed schedule.",
          timestamp: 45,
        },
      ],
    };

    const result = await generateMeetingAnalysis(input);

    expect(result.schemaVersion).toBe(1);
    expect(result.purpose).toBe("Define the implementation timeline.");
    expect(result.outcome).toBe("Approved the plan.");
    expect(result.prose).toBe(
      "A detailed paragraph summarizing what happened."
    );
    expect(result.tone).toBe("POSITIVE");
    expect(result.clientSentiment).toBe("ENTHUSIASTIC");
    expect(result.keyMoments).toHaveLength(1);
    expect(result.keyMoments[0].timestamp).toBe(45);
    expect(result.keyMoments[0].description).toBe("Richard agreed to plan");
    expect(result.keyMoments[0].category).toBe("DECISION");
  });

  it("should sanitize markdown injections from input", async () => {
    const mockResponse = {
      purpose: "Define the implementation timeline.",
      outcome: "Approved the plan.",
      prose: "A detailed paragraph summarizing what happened.",
      tone: "POSITIVE",
      clientSentiment: "ENTHUSIASTIC",
      keyMoments: [],
    };

    let capturedPrompt = "";
    ai.models.generateContent = mock().mockImplementation((req: any) => {
      capturedPrompt = req.contents;
      return Promise.resolve({ text: JSON.stringify(mockResponse) });
    }) as any;

    const input = {
      meetingTitle: "### Weekly Alignment\n---",
      clientName: "Everline",
      participants: [{ name: "## Hacker", role: "TEAM_MEMBER" as const }],
      decisions: [
        {
          title: "# Malicious Title",
          content: "Safe content",
          tags: [],
          evidence: "",
        },
      ],
      tasks: [],
      openQuestions: [],
      importantPoints: [],
      talkTimeStats: {},
      durationSeconds: 100,
      utterances: [],
    };

    await generateMeetingAnalysis(input as any);

    expect(capturedPrompt).not.toContain("###");
    expect(capturedPrompt).not.toContain("---");
    expect(capturedPrompt).not.toContain("## Hacker");
    expect(capturedPrompt).toContain("Name: Hacker");
    expect(capturedPrompt).toContain("Title: Weekly Alignment");
    expect(capturedPrompt).toContain("Title: Malicious Title");
  });

  it("should throw error when Gemini responds with empty text", async () => {
    ai.models.generateContent = mock().mockResolvedValue({
      text: undefined,
    }) as any;

    const input = {
      meetingTitle: "A",
      clientName: "B",
      participants: [],
      decisions: [],
      tasks: [],
      openQuestions: [],
      importantPoints: [],
      talkTimeStats: {},
      durationSeconds: 0,
      utterances: [],
    };
    await expect(generateMeetingAnalysis(input as any)).rejects.toThrow(
      "Empty response received from Gemini meeting analysis"
    );
  });

  it("should throw SyntaxError when Gemini responds with malformed JSON", async () => {
    ai.models.generateContent = mock().mockResolvedValue({
      text: "not json",
    }) as any;

    const input = {
      meetingTitle: "A",
      clientName: "B",
      participants: [],
      decisions: [],
      tasks: [],
      openQuestions: [],
      importantPoints: [],
      talkTimeStats: {},
      durationSeconds: 0,
      utterances: [],
    };
    await expect(generateMeetingAnalysis(input as any)).rejects.toThrow(
      SyntaxError
    );
  });

  it("should throw timeout error when signal is aborted", async () => {
    ai.models.generateContent = mock().mockImplementation((req: any) => {
      Object.defineProperty(req.config.abortSignal, "aborted", { value: true });
      return Promise.reject(new Error("fetch error"));
    }) as any;

    const input = {
      meetingTitle: "A",
      clientName: "B",
      participants: [],
      decisions: [],
      tasks: [],
      openQuestions: [],
      importantPoints: [],
      talkTimeStats: {},
      durationSeconds: 0,
      utterances: [],
    };
    await expect(generateMeetingAnalysis(input as any)).rejects.toThrow(
      "Gemini meeting analysis synthesis timed out"
    );
  });
});
