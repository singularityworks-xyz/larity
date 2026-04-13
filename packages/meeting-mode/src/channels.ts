export const STT_FINAL_PATTERN = "meeting.stt.*";
export const STT_PARTIAL_PATTERN = "meeting.stt.partial.*";
export const SESSION_END = "realtime.session.end";

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

export function commitmentChannel(sessionId: string): string {
  return `meeting.commitment.${sessionId}`;
}

export function speakerChannel(sessionId: string): string {
  return `meeting.speaker.${sessionId}`;
}

export function audioChannel(sessionId: string): string {
  return `realtime.audio.${sessionId}`;
}

export function extractSessionId(channel: string): string | undefined {
  const parts = channel.split(".");

  if (parts[0] === "meeting" && parts.length >= 3) {
    if (parts[1] === "utterance") {
      return parts[2];
    }
    if (parts[1] === "alert") {
      return parts[2];
    }
    if (parts[1] === "topic") {
      return parts[2];
    }
    if (parts[1] === "commitment") {
      return parts[2];
    }
    if (parts[1] === "speaker") {
      return parts[2];
    }
  }

  if (parts[0] === "realtime" && parts.length >= 3) {
    if (parts[1] === "audio") {
      return parts[2];
    }
    if (parts[1] === "stt") {
      return parts[2];
    }
  }

  return parts.pop();
}

export function extractUserIdFromAlertChannel(
  channel: string
): string | undefined {
  const parts = channel.split(".");
  if (parts[0] === "meeting" && parts[1] === "alert" && parts[3] === "user") {
    return parts[4];
  }
  return undefined;
}

export const ALERT_SHARED_PATTERN = "meeting.alert.*.shared";
export const ALERT_PERSONAL_PATTERN = "meeting.alert.*.user.*";
