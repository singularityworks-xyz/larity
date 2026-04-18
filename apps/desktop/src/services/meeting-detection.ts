export type MeetingPromptSource = "calendar" | "heuristic";

export interface ScheduledMeeting {
  id: string;
  title: string;
  startTimeMs: number;
}

export interface MeetingPrompt {
  id: string;
  title: string;
  startTimeMs: number;
  source: MeetingPromptSource;
  context?: string;
}

interface FindCalendarPromptParams {
  meetings: ScheduledMeeting[];
  nowMs: number;
  lookaheadMs: number;
  promptedMeetingIds: Set<string>;
}

export function getMockCalendarMeetings(
  nowMs = Date.now()
): ScheduledMeeting[] {
  return [
    {
      id: "calendar-standup",
      title: "Daily Standup",
      startTimeMs: nowMs + 3 * 60_000,
    },
    {
      id: "calendar-roadmap",
      title: "Product Roadmap Review",
      startTimeMs: nowMs + 32 * 60_000,
    },
  ];
}

export function findCalendarPrompt({
  meetings,
  nowMs,
  lookaheadMs,
  promptedMeetingIds,
}: FindCalendarPromptParams): MeetingPrompt | null {
  let selectedMeeting: ScheduledMeeting | null = null;

  for (const meeting of meetings) {
    if (promptedMeetingIds.has(meeting.id)) {
      continue;
    }

    const startsInMs = meeting.startTimeMs - nowMs;
    const isUpcoming = startsInMs >= 0 && startsInMs <= lookaheadMs;
    if (!isUpcoming) {
      continue;
    }

    if (!selectedMeeting || meeting.startTimeMs < selectedMeeting.startTimeMs) {
      selectedMeeting = meeting;
    }
  }

  if (!selectedMeeting) {
    return null;
  }

  return {
    id: selectedMeeting.id,
    title: selectedMeeting.title,
    startTimeMs: selectedMeeting.startTimeMs,
    source: "calendar",
  };
}

export function formatMeetingCountdown(
  startTimeMs: number,
  nowMs = Date.now()
): string {
  const remainingMs = Math.max(0, startTimeMs - nowMs);
  const remainingMinutes = Math.ceil(remainingMs / 60_000);

  if (remainingMinutes <= 1) {
    return "starts in under a minute";
  }

  return `starts in ${remainingMinutes} min`;
}
