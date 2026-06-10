export const redisKeys = {
  stt: (sessionId: string) => `realtime:stt:${sessionId}`,
  intent: (sessionId: string) => `realtime:intent:${sessionId}`,
  meetingBuffer: (meetingId: string) => `buffers:meeting:${meetingId}`,
  lock: (name: string) => `locks:${name}`,
  cacheUser: (userId: string) => `cache:user:${userId}`,
  health: () => "health:check",
  meetingSession: (sessionId: string) =>
    `meeting:session:${sessionId}` as const,
  activeSessions: () => "meeting.sessions.active" as const,
  meetingToSession: (meetingId: string) =>
    `meeting.session.mapping.${meetingId}` as const,
  sessionLock: (meetingId: string) =>
    `meeting.session.lock.${meetingId}` as const,
  sessionParticipants: (sessionId: string) =>
    `meeting.session.${sessionId}.participants` as const,

  meetingAlertShared: (sessionId: string) =>
    `meeting.alert.${sessionId}.shared` as const,
  meetingAlertPersonal: (sessionId: string, userId: string) =>
    `meeting.alert.${sessionId}.user.${userId}` as const,
  meetingCommitment: (sessionId: string) =>
    `meeting.commitment.${sessionId}` as const,
  meetingLedgerSnapshot: (sessionId: string) =>
    `meeting:ledger:${sessionId}` as const,
  meetingConstraintLedger: (sessionId: string) =>
    `meeting:constraint:${sessionId}` as const,
  meetingContext: (sessionId: string) =>
    `meeting:context:${sessionId}` as const,
  meetingSpeaker: (sessionId: string) =>
    `meeting.speaker.${sessionId}` as const,
  meetingUtterance: (sessionId: string) =>
    `meeting.utterance.${sessionId}` as const,
  meetingTopic: (sessionId: string) => `meeting.topic.${sessionId}` as const,
  sessionConfig: (sessionId: string) =>
    `meeting:session:${sessionId}:config` as const,
  meetingSessionState: (sessionId: string) =>
    `meeting.session_state.${sessionId}` as const,
  meetingJobStatus: (sessionId: string, step: "transcribe" | "summary") =>
    `meeting.job.${sessionId}.${step}.status` as const,
  meetingProcessingComplete: (sessionId: string) =>
    `meeting.processed.${sessionId}` as const,
};
