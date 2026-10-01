export const STT_FINAL_PATTERN = "meeting.stt.final.*";
export const STT_PARTIAL_PATTERN = "meeting.stt.partial.*";
/**
 * Legacy pre-P1.1 final shape `meeting.stt.<sessionId>`. Kept subscribed so
 * a mixed-version deploy (old STT/realtime still publishing the legacy shape)
 * does not silently drop finals during a rolling upgrade.
 */
export const STT_LEGACY_PATTERN = "meeting.stt.*";

const STT_FINAL_PREFIX = "meeting.stt.final.";
const STT_PARTIAL_PREFIX = "meeting.stt.partial.";

/**
 * True only for the legacy `meeting.stt.<sessionId>` shape (3 segments, with
 * a session id that is not the literal `final`/`partial`). New-shape channels
 * also match `STT_LEGACY_PATTERN` (Redis `*` spans dots), so this guard is
 * what prevents legacy-pattern deliveries of new finals from double-handling.
 */
export function isLegacyFinalSttChannel(channel: string): boolean {
  const parts = channel.split(".");
  const legacySessionId = parts[2] ?? "";
  return (
    parts.length === 3 &&
    parts[0] === "meeting" &&
    parts[1] === "stt" &&
    legacySessionId.length > 0 &&
    legacySessionId !== "final" &&
    legacySessionId !== "partial"
  );
}

/** True for `meeting.stt.final.<sessionId>` plus the legacy shape. */
export function isFinalSttChannel(channel: string): boolean {
  if (
    channel.startsWith(STT_FINAL_PREFIX) &&
    channel.length > STT_FINAL_PREFIX.length
  ) {
    return true;
  }
  return isLegacyFinalSttChannel(channel);
}

/** True for `meeting.stt.partial.<sessionId>` channels. */
export function isPartialSttChannel(channel: string): boolean {
  return (
    channel.startsWith(STT_PARTIAL_PREFIX) &&
    channel.length > STT_PARTIAL_PREFIX.length
  );
}
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
  return;
}

export const ALERT_SHARED_PATTERN = "meeting.alert.*.shared";
export const ALERT_PERSONAL_PATTERN = "meeting.alert.*.user.*";
export const VAD_PATTERN = "realtime.vad.*";
export const PARTICIPANT_ROLE_CHANGE_PATTERN = "meeting.role.*";
