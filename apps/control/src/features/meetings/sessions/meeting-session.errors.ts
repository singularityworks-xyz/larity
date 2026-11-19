export class MeetingSessionError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "MeetingSessionError";
    this.code = code;
  }
}

export function getHttpStatusForError(code: string): number {
  const statusMap: Record<string, number> = {
    MEETING_NOT_FOUND: 404,
    CLIENT_NOT_FOUND: 404,
    SESSION_NOT_FOUND: 404,
    INVALID_MEETING_STATUS: 400,
    SESSION_EXISTS: 409,
    LOCK_FAILED: 409,
    SESSION_ENDING: 400,
    SESSION_CORRUPTED: 500,
    CONTEXT_PRELOAD_FAILED: 500,
    UNAUTHORIZED: 403,
  };

  return statusMap[code] || 500;
}
