import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { redisKeys } from "@larity/db/redis/keys";

const operations: string[] = [];
const meetingRecord = {
  id: "meeting-1",
  clientId: "client-1",
  status: "SCHEDULED",
  title: "Planning",
  agenda: "Milestones",
  client: {
    id: "client-1",
    name: "Example",
    orgId: "org-1",
    org: { settings: {} },
  },
};

const prisma = {
  client: {
    findUnique: mock(async () => ({ id: "client-1", orgId: "org-1" })),
  },
  meeting: {
    create: mock(async () => ({ id: "meeting-2" })),
    findUnique: mock(async () => meetingRecord),
    update: mock(() => {
      operations.push("meeting.update");
      return Promise.resolve({});
    }),
  },
  meetingParticipant: {
    upsert: mock(async () => ({})),
  },
  user: {
    findUnique: mock(async () => ({ orgId: "org-1" })),
  },
};

const redis = {
  del: mock(() => {
    operations.push("redis.del");
    return Promise.resolve(1);
  }),
  expire: mock(async () => 1),
  get: mock(async () => null as string | null),
  hget: mock(async () => "true" as string | null),
  hgetall: mock(async () => ({}) as Record<string, string>),
  hset: mock((_key: string, ..._values: unknown[]) => {
    operations.push("redis.hset");
    return Promise.resolve(1);
  }),
  sadd: mock(async () => 1),
  set: mock(async () => "OK" as string | null),
};

const preloadContext = mock(() => {
  operations.push("context.preload");
  return Promise.resolve();
});
const scheduleCleanup = mock(() => {
  operations.push("cleanup.schedule");
  return Promise.resolve();
});

mock.module("@larity/db/client", () => ({ prisma }));
mock.module("@larity/db/redis", () => ({ redis }));
mock.module("./session-context", () => ({ preloadContext }));
mock.module("./session-cleanup", () => ({ scheduleCleanup }));

const { meetingSessionService } = await import("./meeting-session.service");

beforeEach(() => {
  operations.length = 0;
  prisma.client.findUnique.mockClear();
  prisma.meeting.create.mockClear();
  prisma.meeting.findUnique.mockClear();
  prisma.meeting.update.mockClear();
  prisma.meetingParticipant.upsert.mockClear();
  prisma.user.findUnique.mockClear();
  redis.del.mockClear();
  redis.expire.mockClear();
  redis.get.mockClear();
  redis.hget.mockClear();
  redis.hgetall.mockClear();
  redis.hset.mockClear();
  redis.sadd.mockClear();
  redis.set.mockClear();
  preloadContext.mockClear();
  scheduleCleanup.mockClear();
});

afterAll(() => mock.restore());

describe("meeting session side effects", () => {
  test("creates Redis state before changing the meeting to live and releases its lock", async () => {
    const result = await meetingSessionService.start(
      { meetingId: "meeting-1" },
      "host-1"
    );
    const sessionKey = redisKeys.meetingSession(result.sessionId);
    const sessionWrite = redis.hset.mock.calls.find(
      ([key]) => key === sessionKey
    );

    expect(result).toMatchObject({
      meetingId: "meeting-1",
      status: "initializing",
      allowNameCustomization: true,
    });
    expect(sessionWrite?.[1]).toMatchObject({
      userId: "host-1",
      status: "initializing",
      meetingId: "meeting-1",
    });
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "meeting-1" },
      data: {
        status: "LIVE",
        startedAt: expect.any(Date),
      },
    });
    expect(operations.indexOf("redis.hset")).toBeLessThan(
      operations.indexOf("meeting.update")
    );
    expect(redis.del).toHaveBeenCalledWith(redisKeys.sessionLock("meeting-1"));
  });

  test("marks a session ending before scheduling cleanup", async () => {
    redis.hgetall.mockResolvedValue({
      meetingId: "meeting-1",
      status: "active",
    });

    const result = await meetingSessionService.end(
      { sessionId: "session-1", reason: "user_ended" },
      "host-1"
    );

    expect(result).toEqual({ success: true, meetingId: "meeting-1" });
    expect(redis.hset).toHaveBeenCalledWith(
      redisKeys.meetingSession("session-1"),
      "status",
      "ending"
    );
    expect(prisma.meeting.update).toHaveBeenCalledWith({
      where: { id: "meeting-1" },
      data: {
        status: "ENDED",
        endedAt: expect.any(Date),
      },
    });
    expect(scheduleCleanup).toHaveBeenCalledWith("session-1", "meeting-1");
    expect(operations.indexOf("meeting.update")).toBeLessThan(
      operations.indexOf("cleanup.schedule")
    );
  });

  test("rejects an ad-hoc meeting for a client in another organization", async () => {
    prisma.client.findUnique.mockResolvedValue({
      id: "client-2",
      orgId: "org-2",
    });

    await expect(
      meetingSessionService.startAdhoc({ clientId: "client-2" }, "user-1")
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.meeting.create).not.toHaveBeenCalled();
  });

  test("rejects a participant from another organization before recording membership", async () => {
    redis.hgetall.mockResolvedValue({
      meetingId: "meeting-1",
      status: "active",
      userId: "host-1",
    });
    prisma.meeting.findUnique.mockResolvedValue({
      ...meetingRecord,
      client: { ...meetingRecord.client, orgId: "org-1" },
    });
    prisma.user.findUnique.mockResolvedValue({ orgId: "org-2" });

    await expect(
      meetingSessionService.join("session-1", "user-2")
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(prisma.meetingParticipant.upsert).not.toHaveBeenCalled();
    expect(redis.sadd).not.toHaveBeenCalled();
  });
});
