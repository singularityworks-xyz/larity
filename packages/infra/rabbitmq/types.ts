export interface MeetingTranscribeEvent {
  meetingId: string;
  sessionId: string;
  timestamp: number;
  transcript: string;
}

export interface MeetingSummaryEvent {
  meetingId: string;
  sessionId: string;
  summary: string;
  timestamp: number;
}
