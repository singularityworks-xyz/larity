import type { PreMeetingBriefJobData, SummaryJobData } from "./schemas";

export const PRE_MEETING_BRIEF_QUEUE = "meeting.preMeetingBrief";
export const SUMMARY_QUEUE = "meeting.summary";

export function enqueuePreMeetingBrief(
  queue: {
    add(
      name: string,
      data: PreMeetingBriefJobData,
      options: { jobId: string }
    ): Promise<unknown>;
  },
  meetingId: string
): Promise<unknown> {
  return queue.add(
    "generate",
    { meetingId },
    { jobId: `pre-meeting-brief-${meetingId}` }
  );
}

export function enqueueTranscriptionSummary(
  queue: { add(name: string, data: SummaryJobData): Promise<unknown> },
  { sessionId, orgId, meetingId }: SummaryJobData
): Promise<unknown> {
  return queue.add(SUMMARY_QUEUE, { sessionId, orgId, meetingId });
}
