import type { PreMeetingBriefJobData, SummaryJobData } from "./schemas";

export const TRANSCRIBE_QUEUE = "meeting.transcribe";
export const SUMMARY_QUEUE = "meeting.summary";
export const AUDIO_CLEANUP_QUEUE = "meeting.cleanupAudio";
export const CLIENT_PERSONA_QUEUE = "client.personaExtraction";
export const PRE_MEETING_BRIEF_QUEUE = "meeting.preMeetingBrief";
export const REGISTERED_WORKER_QUEUE_NAMES = [
  TRANSCRIBE_QUEUE,
  SUMMARY_QUEUE,
  AUDIO_CLEANUP_QUEUE,
  CLIENT_PERSONA_QUEUE,
  PRE_MEETING_BRIEF_QUEUE,
] as const;

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
