export interface MeetingTranscribeEvent {
  meetingId: string;
  sessionId: string;
  transcript: string;
  timestamp: number;
}

export interface MeetingSummaryEvent {
  meetingId: string;
  sessionId: string;
  summary: string;
  timestamp: number;
}
