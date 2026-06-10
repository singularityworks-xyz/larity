import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockRedisSet = mock();
const mockRedisPublish = mock();
const mockRedisDel = mock();
const mockRedisSrem = mock();

mock.module("@larity/infra/redis", () => ({
  redis: {
    set: mockRedisSet,
    publish: mockRedisPublish,
    del: mockRedisDel,
    srem: mockRedisSrem,
  },
}));

import { redisKeys } from "@larity/infra/redis/keys";
import {
  cleanupMeetingStateKeys,
  publishMeetingProcessed,
  setJobStatus,
} from "../src/lib/job-status";

describe("Job Status & Cleanup Utilities", () => {
  beforeEach(() => {
    mockRedisSet.mockClear();
    mockRedisPublish.mockClear();
    mockRedisDel.mockClear();
    mockRedisSrem.mockClear();
  });

  it("should set job status in Redis with expiration", async () => {
    mockRedisSet.mockResolvedValue("OK");

    await setJobStatus("session-123", "transcribe", "processing");

    expect(mockRedisSet).toHaveBeenCalledWith(
      redisKeys.meetingJobStatus("session-123", "transcribe"),
      "processing",
      "EX",
      86_400
    );
  });

  it("should publish meeting processed event to Redis Pub/Sub", async () => {
    mockRedisPublish.mockResolvedValue(1);

    await publishMeetingProcessed("meeting-456", "session-123");

    expect(mockRedisPublish).toHaveBeenCalledWith(
      redisKeys.meetingProcessingComplete("session-123"),
      JSON.stringify({
        meetingId: "meeting-456",
        sessionId: "session-123",
        status: "complete",
      })
    );
  });

  it("should delete temporary Redis keys and remove session from active set", async () => {
    mockRedisDel.mockResolvedValue(1);
    mockRedisSrem.mockResolvedValue(1);

    await cleanupMeetingStateKeys("meeting-456", "session-123");

    expect(mockRedisDel).toHaveBeenCalled();
    expect(mockRedisSrem).toHaveBeenCalledWith(
      redisKeys.activeSessions(),
      "session-123"
    );
  });
});
