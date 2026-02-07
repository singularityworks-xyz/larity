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
};
