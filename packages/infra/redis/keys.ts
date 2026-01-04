export const redisKeys = {
    stt: (sessionId: string) => `realtime:stt:${sessionId}`,
    intent: (sessionId: string) => `realtime:intent:${sessionId}`,
    meetingBuffer: (meetingId: string) => `buffers:meeting:${meetingId}`,
    lock: (name: string) => `locks:${name}`,
    cacheUser: (userId: string) => `cache:user:${userId}`,
    health: () => 'health:check'
};