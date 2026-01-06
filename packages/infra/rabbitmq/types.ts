export type MeetingTranscribeEvent = {
  meetingId: string;
  sessionId: string;
  transcript: string;
  timestamp: number;
};

export type MeetingSummaryEvent = {
  meetingId: string;
  sessionId: string;
  summary: string;
  timestamp: number;
};
