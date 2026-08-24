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
  it("all TTLs are positive integers", () => {
    for (const value of Object.values(TTL)) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThan(0);
    }
  });

  it("maintains cache and session duration hierarchy", () => {
    expect(TTL.SESSION_STATE).toBeGreaterThan(TTL.MEETING_CONTEXT);
    expect(TTL.CACHE_LONG).toBeGreaterThanOrEqual(TTL.CACHE_SHORT);
    expect(TTL.MEETING_BUFFER).toBeGreaterThanOrEqual(TTL.STT);
  });
});
