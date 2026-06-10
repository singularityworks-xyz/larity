export const STT_FINAL_PATTERN = "meeting.stt.*";
export const STT_PARTIAL_PATTERN = "meeting.stt.partial.*";
export const SESSION_END = "realtime.session.end";
export const PARTICIPANT_JOIN = "realtime.participant.join";

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

export function constraintChannel(sessionId: string): string {
  return `meeting.constraint.${sessionId}`;
}

export function ledgerChannel(sessionId: string): string {
  return `meeting.ledger.${sessionId}`;
}

/** Dev telemetry: Tier 1–4 summarization emitted after evaluation (Redis pub/sub) */
export function pipelineTraceChannel(sessionId: string): string {
  return `meeting.pipeline.${sessionId}`;
}

export function speakerChannel(sessionId: string): string {
  return `meeting.speaker.${sessionId}`;
}

export function participantRoleChangeChannel(sessionId: string): string {
  return `meeting.role.${sessionId}`;
}

export function audioChannel(sessionId: string): string {
  return `realtime.audio.${sessionId}`;
}

export function vadChannel(sessionId: string): string {
  return `realtime.vad.${sessionId}`;
}

const meetingSessionChannels = new Set([
  "utterance",
  "alert",
  "topic",
  "commitment",
  "constraint",
  "ledger",
  "speaker",
  "pipeline",
  "role",
]);

const realtimeSessionChannels = new Set(["audio", "stt", "vad"]);

export function extractSessionId(channel: string): string | undefined {
  const parts = channel.split(".");
  const [namespace, channelType, sessionId] = parts;

  if (
    namespace === "meeting" &&
    sessionId &&
    channelType &&
    meetingSessionChannels.has(channelType)
  ) {
    return sessionId;
  }

  if (
    namespace === "realtime" &&
    sessionId &&
    channelType &&
    realtimeSessionChannels.has(channelType)
  ) {
    return sessionId;
  }

  return parts.at(-1);
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
export const VAD_PATTERN = "realtime.vad.*";
export const PARTICIPANT_ROLE_CHANGE_PATTERN = "meeting.role.*";
