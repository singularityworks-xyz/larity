import { expect, mock, test } from "bun:test";
import {
  enqueuePreMeetingBrief,
  enqueueTranscriptionSummary,
} from "./meeting-handoffs";
import { PreMeetingBriefJobSchema, SummaryJobSchema } from "./schemas";

test("repeated brief scheduling uses the same job identity and accepted payload", async () => {
  const add = mock((name: string, data: unknown, options: { jobId: string }) =>
    Promise.resolve({
      name,
      data: PreMeetingBriefJobSchema.parse(data),
      options,
    })
  );
  const first = await enqueuePreMeetingBrief({ add }, "meeting-1");
  const repeat = await enqueuePreMeetingBrief({ add }, "meeting-1");

  expect(first).toEqual({
    name: "generate",
    data: { meetingId: "meeting-1" },
    options: { jobId: "pre-meeting-brief-meeting-1" },
  });
  expect(repeat).toEqual(first);
});

test("transcription forwards session scope and propagates an enqueue failure", async () => {
  const input = {
    meetingId: "meeting-1",
    orgId: "org-1",
    sessionId: "session-1",
  };
  const failure = new Error("queue unavailable");
  const add = mock((name: string, data: unknown) => {
    expect(name).toBe("meeting.summary");
    expect(SummaryJobSchema.parse(data)).toEqual(input);
    return Promise.reject(failure);
  });

  await expect(enqueueTranscriptionSummary({ add }, input)).rejects.toBe(
    failure
  );
});
