export const STT_FINAL_PATTERN = 'meeting.stt.*';
export const STT_PARTIAL_PATTERN = 'meeting.stt.partial.*';
export const SESSION_END = 'realtime.session.end';

export function utteranceChannel(sessionId: string): string {
  return `meeting.utterance.${sessionId}`;
}

export function extractSessionId(channel: string): string | undefined {
  const parts = channel.split('.');
  return parts.pop();
}
