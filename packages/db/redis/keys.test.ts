import { describe, expect, it } from "bun:test";
import { redisKeys } from "../redis/keys";
import { TTL } from "../redis/ttl";

describe("redisKeys", () => {
  it("scopes keys by session/meeting/user", () => {
    expect(redisKeys.stt("abc")).toBe("realtime:stt:abc");
    expect(redisKeys.meetingBuffer("m1")).toBe("buffers:meeting:m1");
    expect(redisKeys.lock("run")).toBe("locks:run");
    expect(redisKeys.cacheUser("u1")).toBe("cache:user:u1");
    expect(redisKeys.meetingSession("s1")).toBe("meeting:session:s1");
  });

  it("escapes nothing but preserves session boundaries", () => {
    const a = redisKeys.meetingCommitment("sess");
    const b = redisKeys.meetingCommitment("sess-2");
    expect(a).not.toBe(b);
    expect(redisKeys.sessionParticipants("s1")).toBe(
      "meeting.session.s1.participants"
    );
  });

  it("includes step in job status keys", () => {
    expect(redisKeys.meetingJobStatus("s1", "transcribe")).toBe(
      "meeting.job.s1.transcribe.status"
    );
    expect(redisKeys.meetingJobStatus("s1", "summary")).toBe(
      "meeting.job.s1.summary.status"
    );
  });
});

describe("TTL", () => {
  it("session state is 7 days", () => {
    expect(TTL.SESSION_STATE).toBe(7 * 24 * 60 * 60);
  });

  it("meeting context is 4 hours", () => {
    expect(TTL.MEETING_CONTEXT).toBe(14_400);
  });

  it("all TTLs are positive", () => {
    for (const value of Object.values(TTL)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
