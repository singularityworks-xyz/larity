const PREFIX = "realtime";

export function vadChannel(sessionId: string): string {
  return `realtime.vad.${sessionId}`;
}

export function utteranceChannel(sessionId: string): string {
  return `meeting.utterance.${sessionId}`;
}

export function sharedAlertChannel(sessionId: string): string {
  return `meeting.alert.${sessionId}.shared`;
}

export function personalAlertChannel(
  sessionId: string,
  userId: string
): string {
  return `meeting.alert.${sessionId}.user.${userId}`;
}

export function topicChannel(sessionId: string): string {
  return `meeting.topic.${sessionId}`;
}

export function meetingProcessedChannel(sessionId: string): string {
  return `meeting.processed.${sessionId}`;
}

export function participantRoleChangeChannel(sessionId: string): string {
  return `meeting.role.${sessionId}`;
}

export const SESSION_START = `${PREFIX}.session.start`;

export const SESSION_END = `${PREFIX}.session.end`;

export const PARTICIPANT_JOIN = `${PREFIX}.participant.join`;

export const PARTICIPANT_LEAVE = `${PREFIX}.participant.leave`;

export const channels = {
  utteranceChannel,
  sharedAlertChannel,
  personalAlertChannel,
  topicChannel,
  meetingProcessedChannel,
  vadChannel,
  participantRoleChangeChannel,
  SESSION_START,
  SESSION_END,
  PARTICIPANT_JOIN,
  PARTICIPANT_LEAVE,
} as const;
